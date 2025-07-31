// SPDX-License-Identifier: MIT
pragma solidity 0.8.21;

import "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/ERC4626Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts-upgradeable/utils/math/MathUpgradeable.sol";
import "@openzeppelin/contracts/utils/math/SafeCast.sol";

/**
 * @title ERC4626YieldVault
 * @dev EIP-4626-compliant vault with integrated share token using OpenZeppelin's standard implementation
 * @notice Users deposit base tokens and receive share tokens per EIP-4626 standard
 */
contract ERC4626YieldVault is
    ERC4626Upgradeable,
    PausableUpgradeable,
    ReentrancyGuardUpgradeable,
    AccessControlUpgradeable,
    UUPSUpgradeable
{
    using MathUpgradeable for uint256;
    using SafeERC20Upgradeable for IERC20Upgradeable;
    using SafeCast for uint256;

    // ============================================================================
    // CONSTANTS - Security and Bounds Definitions  
    // ============================================================================

    /**
     * @dev Maximum allowed NAV value: 1,000,000 tokens (with 18 decimals)
     * Prevents extreme NAV values that could cause overflow in calculations
     * Upper bound for Net Asset Value to maintain system stability
     */
    uint256 private constant MAX_NAV_VALUE = 1e24; // Maximum NAV: 1,000,000 (with 18 decimals)
    
    /**
     * @dev Minimum allowed NAV value: 0.000001 tokens (with 18 decimals)  
     * Prevents NAV from going to zero which would break conversion calculations
     * Lower bound ensures mathematical operations remain valid
     */
    uint256 private constant MIN_NAV_VALUE = 1e12; // Minimum NAV: 0.000001 (with 18 decimals)
    
    /**
     * @dev Maximum total assets: 1 billion tokens (with 18 decimals)
     * System-wide limit to prevent overflow in asset calculations
     * Protects against extreme total asset values
     */
    uint256 private constant MAX_TOTAL_ASSETS = 1e27; // Maximum total assets: 1 billion tokens (with 18 decimals)
    
    /**
     * @dev Maximum single deposit: 10 million tokens
     * Per-transaction limit to prevent individual large deposits
     * Helps maintain fair access and prevents single-user domination
     */
    uint256 private constant MAX_SINGLE_DEPOSIT = 1e25; // Maximum single deposit: 10 million tokens
    
    /**
     * @dev Maximum total shares that can exist
     * Prevents share supply from reaching overflow limits
     * System-wide cap on total share issuance
     */
    uint256 private constant MAX_SHARES_SUPPLY = 1e27; // Maximum total shares that can exist

    // ============================================================================
    // ROLES
    // ============================================================================

    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");
    bytes32 public constant ORACLE_ROLE = keccak256("ORACLE_ROLE");
    bytes32 public constant TREASURY_ROLE = keccak256("TREASURY_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");
    bytes32 public constant UPGRADER_ROLE = keccak256("UPGRADER_ROLE");

    // ============================================================================
    // STATE VARIABLES
    // ============================================================================

    // Core state
    uint256 public currentNAV; // Net Asset Value (18 decimals, starts at 1e18)
    uint256 public lastNAVUpdate;
    uint256 public totalAssetsManaged;
    address public treasuryAddress;

    // Business logic constraints
    uint256 public withdrawalCooldown;
    uint256 public maxUserDeposit;
    uint256 public maxTotalDeposits;

    // Time constraints - simplified for efficiency
    mapping(address => uint256) public lastDepositTime;
    mapping(address => uint256) public lastWithdrawalTime;
    mapping(address => uint256) public userDeposits;

    // Security enhancements
    uint256 public maxNAVChange;
    uint256 public navUpdateDelay;
    uint256 public lastNAVChangeTime;
    uint256 public maxTotalAssetsDeviation;

    // ============================================================================
    // EVENTS
    // ============================================================================
    event NAVUpdated(
        uint256 oldNAV,
        uint256 newNAV,
        uint256 totalAssets,
        uint256 timestamp
    );
    event TreasuryWithdrawal(
        address indexed treasury,
        uint256 amount,
        uint256 remainingBalance
    );
    event TreasuryDeposit(
        address indexed treasury,
        uint256 amount,
        uint256 newBalance,
        uint256 yieldEarned
    );
    event WithdrawalCooldownUpdated(uint256 oldValue, uint256 newValue);
    event MaxUserDepositUpdated(uint256 oldValue, uint256 newValue);
    event MaxTotalDepositsUpdated(uint256 oldValue, uint256 newValue);
    event MaxNAVChangeUpdated(uint256 oldValue, uint256 newValue);
    event NAVUpdateDelayUpdated(uint256 oldValue, uint256 newValue);
    event SlippageProtectionTriggered(
        address indexed user,
        uint256 expectedShares,
        uint256 actualShares
    );
    event BatchWithdrawal(
        address indexed admin,
        uint256 totalAssets,
        uint256 totalShares
    );

    // Events for overflow monitoring (M-02)
    event BoundsCheckFailed(
        address indexed user,
        string operation,
        uint256 value,
        uint256 limit
    );
    event ConversionOverflowPrevented(
        address indexed user,
        string operation,
        uint256 inputValue
    );

    // Missing administrative events (L-01 fix)
    event TreasuryAddressUpdated(
        address indexed oldTreasury,
        address indexed newTreasury,
        address indexed admin
    );
    event UpgradeAuthorized(
        address indexed admin,
        address indexed newImplementation,
        uint256 timestamp
    );
    event WithdrawalAttemptDuringCooldown(
        address indexed user,
        uint256 attemptedAmount,
        uint256 remainingCooldownTime
    );
    event DepositLimitExceeded(
        address indexed user,
        uint256 attemptedAmount,
        uint256 currentLimit,
        string limitType
    );
    event NAVChangeRejected(
        address indexed oracle,
        uint256 proposedNAV,
        uint256 currentNAV,
        uint256 changePercentage,
        uint256 maxAllowedChange
    );

    // ============================================================================
    // CUSTOM ERRORS
    // ============================================================================

    error NAVOutOfRange(uint256 currentNAV, uint256 minAllowed, uint256 maxAllowed, string reason);
    error ConversionOutOfBounds(uint256 inputAmount, uint256 maxAllowed, string operation);
    error DepositLimitsExceeded(
        address user,
        uint256 attemptedAmount,
        uint256 currentUserDeposits,
        uint256 maxUserLimit,
        uint256 maxSingleDeposit,
        uint256 maxTotalLimit,
        string reason
    );
    error WithdrawalValidationFailed(
        address user,
        uint256 assets,
        uint256 shares,
        string reason
    );
    error NAVUpdateValidationFailed(
        uint256 proposedNAV,
        uint256 currentNAV,
        uint256 changePercentage,
        uint256 maxAllowedChange,
        string reason
    );
    error AdminParameterInvalid(
        string parameter,
        uint256 proposedValue,
        uint256 minAllowed,
        uint256 maxAllowed,
        string reason
    );

    // ============================================================================
    // CONSTRUCTOR
    // ============================================================================

    constructor() {
        _disableInitializers();
    }

    function initialize(
        IERC20Upgradeable _assetToken,
        string memory _name,
        string memory _symbol,
        address _treasury,
        address _defaultAdmin
    ) public initializer {
        __ERC20_init(_name, _symbol);
        __ERC4626_init(_assetToken);
        __Pausable_init();
        __ReentrancyGuard_init();
        __AccessControl_init();
        __UUPSUpgradeable_init();

        treasuryAddress = _treasury;
        currentNAV = 1e18; // Start with 1:1 ratio

        // Set initial business logic parameters
        withdrawalCooldown = 24 hours;
        maxUserDeposit = 100_000e18;
        maxTotalDeposits = 5_000_000e18;

        // Set initial security parameters
        maxNAVChange = 1500; // 15% max change (basis points)
        navUpdateDelay = 1 hours; // 1 hour delay after NAV update
        lastNAVChangeTime = block.timestamp; // Initialize to deployment time
        maxTotalAssetsDeviation = 500; // 5% max deviation for totalAssets validation

        _grantRole(DEFAULT_ADMIN_ROLE, _defaultAdmin);
        _grantRole(ADMIN_ROLE, _defaultAdmin);
        _grantRole(ORACLE_ROLE, _defaultAdmin);
        _grantRole(TREASURY_ROLE, _defaultAdmin);
        _grantRole(PAUSER_ROLE, _defaultAdmin);
        _grantRole(UPGRADER_ROLE, _defaultAdmin);
    }

    // ============================================================================
    // EXTERNAL FUNCTIONS - OVERRIDES
    // ============================================================================

    /**
     * @notice Returns the total assets under management
     * @return The total amount of underlying assets managed by the vault
     */
    function totalAssets() public view override returns (uint256) {
        return totalAssetsManaged;
    }

    // ============================================================================
    // EXTERNAL FUNCTIONS - ERC4626 INTERFACE
    // ============================================================================

    /** @dev See {IERC4626-maxDeposit}. */
    function maxDeposit(
        address receiver
    ) public view override returns (uint256) {
        if (paused()) return 0;

        // ERC-4626 compliance: Return type(uint256).max if no effective limits
        if (maxUserDeposit >= MAX_SINGLE_DEPOSIT && maxTotalDeposits >= MAX_TOTAL_ASSETS) {
            return type(uint256).max;
        }

        // Calculate remaining limits for this receiver
        uint256 remainingUserLimit = maxUserDeposit > userDeposits[receiver]
            ? maxUserDeposit - userDeposits[receiver]
            : 0;
        uint256 remainingVaultLimit = maxTotalDeposits > totalAssetsManaged
            ? maxTotalDeposits - totalAssetsManaged
            : 0;

        return
            remainingUserLimit < remainingVaultLimit
                ? remainingUserLimit
                : remainingVaultLimit;
    }

    /**
     * @notice Returns the maximum number of shares that can be minted for a receiver
     * @param receiver The address that would receive the shares
     * @return The maximum number of shares that can be minted
     */
    function maxMint(address receiver) public view override returns (uint256) {
        uint256 maxAssets = maxDeposit(receiver);
        
        // ERC-4626 compliance: Return type(uint256).max if no effective limits
        if (maxAssets == type(uint256).max) {
            return type(uint256).max;
        }
        
        return
            maxAssets == 0
                ? 0
                : _convertToShares(maxAssets, MathUpgradeable.Rounding.Down);
    }

    /**
     * @notice Returns the maximum amount of assets that can be withdrawn by an owner
     * @param owner The address that owns the shares
     * @return The maximum amount of assets that can be withdrawn, 0 if withdrawal not allowed
     */
    function maxWithdraw(address owner) public view override returns (uint256) {
        if (!canWithdraw(owner)) return 0;
        return super.maxWithdraw(owner);
    }

    /**
     * @notice Returns the maximum number of shares that can be redeemed by an owner
     * @param owner The address that owns the shares
     * @return The maximum number of shares that can be redeemed, 0 if withdrawal not allowed
     */
    function maxRedeem(address owner) public view override returns (uint256) {
        if (!canWithdraw(owner)) return 0;
        return super.maxRedeem(owner);
    }

    // ============================================================================
    // EXTERNAL FUNCTIONS
    // ============================================================================

    /**
     * @notice Returns the time remaining until withdrawal is allowed for a user
     * @param user The address to check withdrawal timing for
     * @return The number of seconds until withdrawal is allowed, 0 if already allowed
     */
    function timeUntilWithdrawal(address user) external view returns (uint256) {
        uint256 cooldownEnd = lastDepositTime[user] + withdrawalCooldown;
        uint256 navDelayEnd = lastNAVChangeTime + navUpdateDelay;
        uint256 withdrawalDelayEnd = lastWithdrawalTime[user] + 1 minutes;

        // Find the maximum constraint
        uint256 maxEnd = cooldownEnd > navDelayEnd ? cooldownEnd : navDelayEnd;
        maxEnd = maxEnd > withdrawalDelayEnd ? maxEnd : withdrawalDelayEnd;

        return block.timestamp >= maxEnd ? 0 : maxEnd - block.timestamp;
    }

    /**
     * @notice Updates the Net Asset Value and total assets (oracle only)
     * @param newNAV The new NAV value (cannot be zero)
     * @param newTotalAssets The new total assets amount
     */
    function updateNAV(
        uint256 newNAV,
        uint256 newTotalAssets
    ) external onlyRole(ORACLE_ROLE) whenNotPaused {
        // Basic validation first
        if (
            newNAV == 0 ||
            newTotalAssets > MAX_TOTAL_ASSETS ||
            block.timestamp < lastNAVUpdate + 6 hours
        ) {
            if (newNAV == 0) {
                revert NAVUpdateValidationFailed(newNAV, currentNAV, 0, 0, "nav_must_be_positive");
            }
            if (newTotalAssets > MAX_TOTAL_ASSETS) {
                revert NAVUpdateValidationFailed(newNAV, currentNAV, 0, 0, "total_assets_exceed_maximum");
            }
            revert NAVUpdateValidationFailed(newNAV, currentNAV, 0, 0, "update_too_frequent");
        }

        // Calculate NAV change percentage once (eliminates 3 duplicate calculations)
        uint256 changePercentage = _calculateNAVChangePercentage(newNAV);

        // Consolidated validation with helper functions
        _validateConsolidatedNAVUpdate(newNAV, newTotalAssets, changePercentage);

        // Update state
        uint256 oldNAV = currentNAV;
        currentNAV = newNAV;
        totalAssetsManaged = newTotalAssets;
        lastNAVUpdate = block.timestamp;

        // Track significant changes for front-running protection
        if (changePercentage > 100) {
            // More than 1% change
            lastNAVChangeTime = block.timestamp;
        }

        emit NAVUpdated(oldNAV, newNAV, newTotalAssets, block.timestamp);
    }

    /**
     * @notice Withdraws funds to the treasury address for DeFi deployment (treasury role only)
     * @dev Moves assets from vault to treasury for external yield generation
     * @dev Does not affect totalAssetsManaged as assets remain under vault management
     * @param amount The amount to withdraw to treasury
     */
    function withdrawToTreasury(
        uint256 amount
    ) external onlyRole(TREASURY_ROLE) whenNotPaused {
        require(amount > 0, "Zero amount");
        uint256 vaultBalance = _getVaultBalance();
        require(amount <= vaultBalance, "Insufficient balance");
        
        IERC20Upgradeable(asset()).safeTransfer(treasuryAddress, amount);
        emit TreasuryWithdrawal(treasuryAddress, amount, vaultBalance - amount);
    }

    /**
     * @notice Deposits assets back from treasury operations (treasury role only)
     * @dev Returns principal + yield from DeFi strategies back to the vault
     * @dev Does not affect totalAssetsManaged as this only changes asset location
     * @param amount The amount to deposit back from treasury operations
     */
    function depositFromTreasury(
        uint256 amount
    ) external onlyRole(TREASURY_ROLE) whenNotPaused {
        require(amount > 0, "Zero amount");
        
        uint256 currentBalance = _getVaultBalance();
        
        // Calculate potential yield earned (difference from what we expect to return)
        // Note: This is informational only - actual yield tracking requires off-chain data
        uint256 vaultAssetsBeforeDeposit = currentBalance;
        uint256 estimatedYield = amount > vaultAssetsBeforeDeposit ? 
            amount - vaultAssetsBeforeDeposit : 0;
        
        // Transfer assets from treasury to vault
        IERC20Upgradeable(asset()).safeTransferFrom(
            treasuryAddress,
            address(this),
            amount
        );
        
        uint256 newBalance = currentBalance + amount;
        emit TreasuryDeposit(treasuryAddress, amount, newBalance, estimatedYield);
    }

    /**
     * @notice Pauses the contract (pauser role only)
     */
    function pause() external onlyRole(PAUSER_ROLE) {
        _pause(); // Emits standard Paused(address) event
    }

    /**
     * @notice Unpauses the contract (admin role only)  
     */
    function unpause() external onlyRole(ADMIN_ROLE) {
        _unpause(); // Emits standard Unpaused(address) event
    }

    /**
     * @notice Performs batch withdrawals for multiple users (admin only)
     * @param owners Array of share owners
     * @param receivers Array of addresses to receive the assets
     * @param emergency If true, bypasses pause state for emergency situations
     */
    function batchWithdraw(
        address[] calldata owners,
        address[] calldata receivers,
        bool emergency
    ) external onlyRole(ADMIN_ROLE) nonReentrant {
        // Emergency mode bypasses pause state
        if (!emergency) {
            require(!paused(), "Contract is paused");
        }

        _validateBatchInputs(owners, receivers);

        uint256 totalAssetsWithdrawn = 0;
        uint256 totalSharesBurned = 0;

        // Emergency mode bypasses liquidity pre-check for speed
        if (!emergency) {
            _validateBatchLiquidity(owners);
        }

        // Process each withdrawal
        for (uint256 i = 0; i < owners.length; i++) {
            (uint256 assets, uint256 shares) = _processBatchWithdrawal(
                owners[i],
                receivers[i],
                emergency
            );

            totalAssetsWithdrawn += assets;
            totalSharesBurned += shares;
        }

        // Update vault state
        totalAssetsManaged -= totalAssetsWithdrawn;

        // Liquidity sufficiency check (only for non-emergency)
        if (!emergency) {
            uint256 vaultBalance = _getVaultBalance();
            require(
                totalAssetsWithdrawn <= vaultBalance,
                "Insufficient vault liquidity for batch withdrawal"
            );
        }

        emit BatchWithdrawal(
            _msgSender(),
            totalAssetsWithdrawn,
            totalSharesBurned
        );
    }

    // ============================================================================
    // INTERNAL FUNCTIONS - Non-view functions first, then view functions
    // ============================================================================

    // Override deposit to add business logic (M-02 fix)
    function _deposit(
        address caller,
        address receiver,
        uint256 assets,
        uint256 shares
    ) internal override nonReentrant whenNotPaused {
        if (
            assets > MAX_SINGLE_DEPOSIT ||
            shares > MAX_SHARES_SUPPLY ||
            userDeposits[receiver] > maxUserDeposit ||
            userDeposits[receiver] > maxUserDeposit - assets ||
            totalAssetsManaged > maxTotalDeposits - assets
        ) {
            revert DepositLimitsExceeded(
                receiver,
                assets,
                userDeposits[receiver],
                maxUserDeposit,
                MAX_SINGLE_DEPOSIT,
                maxTotalDeposits,
                "deposit_limits_validation_failed"
            );
        }

        super._deposit(caller, receiver, assets, shares);

        // Update our tracking 
        totalAssetsManaged += assets;
        userDeposits[receiver] += assets;
        lastDepositTime[receiver] = block.timestamp;
    }

    /**
     * @notice ERC4626 withdrawal function with simplified, user-friendly business logic
     * @dev Overrides ERC4626Upgradeable._withdraw with enhanced security and better UX
     * @param caller The address calling the withdrawal function
     * @param receiver The address that will receive the assets
     * @param owner The address that owns the shares being redeemed
     * @param assets The amount of assets to withdraw
     * @param shares The amount of shares to burn
     */
    function _withdraw(
        address caller,
        address receiver,
        address owner,
        uint256 assets,
        uint256 shares
    ) internal override nonReentrant whenNotPaused { 
        
        // 1. Deposit cooldown protection (anti-flash-loan, the main security requirement)
        bool cooldownMet = lastDepositTime[owner] == 0 || 
            block.timestamp >= lastDepositTime[owner] + withdrawalCooldown;
        
        if (!cooldownMet) {
            uint256 timeRemaining = lastDepositTime[owner] + withdrawalCooldown - block.timestamp;
            emit WithdrawalAttemptDuringCooldown(owner, assets, timeRemaining);
            revert WithdrawalValidationFailed(owner, assets, shares, "deposit_cooldown_active");
        }

        // 2. Liquidity validation (ensure vault can fulfill withdrawal)
        uint256 vaultBalance = _getVaultBalance();
        require(assets <= vaultBalance, "Insufficient vault liquidity");

        // 3. NAV update protection (only for users who deposited during recent volatility)
        // Only apply NAV delays to users who deposited recently during volatile periods
        if (_shouldApplyNAVDelay(owner)) {
            require(
                block.timestamp >= lastNAVChangeTime + navUpdateDelay,
                "NAV recently updated, please wait"
            );
        }
 
        super._withdraw(caller, receiver, owner, assets, shares);

        totalAssetsManaged -= assets;

        // Update user deposits tracking (fix inconsistency issue)
        if (userDeposits[owner] >= assets) {
            userDeposits[owner] -= assets;
        } else {
            emit ConversionOverflowPrevented(owner, "userDeposits_tracking_inconsistent", userDeposits[owner]);
            userDeposits[owner] = 0;
        }

        lastWithdrawalTime[owner] = block.timestamp;
    }

    /**
     * @dev Internal helper to process individual batch withdrawal
     */
    function _processBatchWithdrawal(
        address owner,
        address receiver,
        bool emergency
    ) internal returns (uint256 assets, uint256 shares) {
        shares = balanceOf(owner);
        if (shares == 0) return (0, 0);

        assets = convertToAssets(shares);

        // Non-emergency requires withdrawal eligibility check
        if (!emergency) {
            require(canWithdraw(owner), "Withdrawal not allowed");
        }

        _burn(owner, shares);
        IERC20Upgradeable(asset()).safeTransfer(receiver, assets);

        // Update user tracking
        if (userDeposits[owner] >= assets) {
            userDeposits[owner] -= assets;
        } else {
            userDeposits[owner] = 0;
        }

        lastWithdrawalTime[owner] = block.timestamp;

        emit Withdraw(_msgSender(), receiver, owner, assets, shares);
    }

    /**
     * @dev Determines if NAV delay should apply to a specific user
     * Only applies to users who deposited recently during periods of NAV volatility
     * @param user The user address to check
     * @return true if NAV delay should be applied
     */
    function _shouldApplyNAVDelay(address user) internal view returns (bool) {
        // If NAV hasn't changed recently, no delay needed
        if (block.timestamp >= lastNAVChangeTime + navUpdateDelay) {
            return false;
        }

        // If user deposited before the recent NAV change, no delay needed
        if (lastDepositTime[user] < lastNAVChangeTime) {
            return false;
        }

        // If user deposited after a significant NAV change, apply delay
        // This prevents users from depositing right after NAV updates and immediately withdrawing
        return true;
    }

    /**
     * @dev Validates NAV is within bounds to eliminate code duplication
     */
    function _validateNAVBounds() internal view {
        if (currentNAV < MIN_NAV_VALUE || currentNAV > MAX_NAV_VALUE) {
            revert NAVOutOfRange(currentNAV, MIN_NAV_VALUE, MAX_NAV_VALUE, "nav_bounds_check_failed");
        }
    }

    /**
     * @dev Gets vault balance to eliminate repeated IERC20 calls
     */
    function _getVaultBalance() internal view returns (uint256) {
        return IERC20Upgradeable(asset()).balanceOf(address(this));
    }

    // Override conversion functions to use custom NAV logic (M-02 fix)
    function _convertToShares(
        uint256 assets,
        MathUpgradeable.Rounding rounding
    ) internal view override returns (uint256) {
        // Pure mathematical conversion using current NAV
        // Business logic validations are handled in maxDeposit() and _deposit()
        uint256 decimalsMultiplier = 10 ** decimals();
        return assets.mulDiv(decimalsMultiplier, currentNAV, rounding);
    }

    function _convertToAssets(
        uint256 shares,
        MathUpgradeable.Rounding rounding
    ) internal view override returns (uint256) {
        // Pure mathematical conversion using current NAV
        // Business logic validations are handled in maxWithdraw() and _withdraw()
        return shares.mulDiv(currentNAV, 10 ** decimals(), rounding);
    }

    /**
     * @dev Consolidated validation for NAV updates - combines multiple checks for gas efficiency
     */
    function _validateConsolidatedNAVUpdate(
        uint256 newNAV,
        uint256 newTotalAssets,
        uint256 changePercentage
    ) internal view {
        // Combined NAV bounds and change validation
        if (
            newNAV < MIN_NAV_VALUE ||
            newNAV > MAX_NAV_VALUE ||
            (currentNAV > 0 && changePercentage > maxNAVChange)
        ) {
            revert NAVUpdateValidationFailed(
                newNAV,
                currentNAV,
                changePercentage,
                maxNAVChange,
                newNAV < MIN_NAV_VALUE || newNAV > MAX_NAV_VALUE 
                    ? "nav_outside_bounds" 
                    : "nav_change_too_large"
            );
        }

        // Combined total assets validation
        uint256 vaultBalance = _getVaultBalance();
        if (maxTotalAssetsDeviation > 10000) {
            revert NAVUpdateValidationFailed(newNAV, currentNAV, changePercentage, 0, "assets_validation_failed");
        }

        // Validate total assets deviation
        if (totalAssetsManaged > 0) {
            uint256 maxDeviation = totalAssetsManaged.mulDiv(
                maxTotalAssetsDeviation,
                10000,
                MathUpgradeable.Rounding.Up
            );
            uint256 maxAllowedAssets = totalAssetsManaged > type(uint256).max - maxDeviation
                ? type(uint256).max
                : totalAssetsManaged + maxDeviation;

            if (newTotalAssets < vaultBalance || newTotalAssets > maxAllowedAssets) {
                revert NAVUpdateValidationFailed(newNAV, currentNAV, changePercentage, 0, 
                "total_assets_deviation_exceeded");
            }
        }

        // Validate conversion overflows
        if (newTotalAssets > 0 && totalSupply() > 0) {
            uint256 testAssets = 1e18; // 1 token
            if (
                testAssets > type(uint256).max / (10 ** decimals()) ||
                testAssets.mulDiv(10 ** decimals(), newNAV, MathUpgradeable.Rounding.Down) == 0
            ) {
                revert NAVUpdateValidationFailed(newNAV, currentNAV, changePercentage, 0, "conversion_overflow_risk");
            }

            uint256 testShares = 1e18; // 1 share
            if (testShares > type(uint256).max / newNAV) {
                revert NAVUpdateValidationFailed(newNAV, currentNAV, changePercentage, 0, "conversion_overflow_risk");
            }
        }
    }

    /**
     * @dev Calculate NAV change percentage (eliminates code duplication)
     * @param newNAV The proposed new NAV value
     * @return changePercentage The percentage change in basis points
     */
    function _calculateNAVChangePercentage(
        uint256 newNAV
    ) internal view returns (uint256) {
        if (currentNAV == 0) return 0;
        return
            newNAV > currentNAV
                ? ((newNAV - currentNAV) * 10000) / currentNAV
                : ((currentNAV - newNAV) * 10000) / currentNAV;
    }

    /**
     * @dev Internal helper to validate batch liquidity requirements
     */
    function _validateBatchLiquidity(address[] calldata owners) internal view {
        uint256 vaultBalance = _getVaultBalance();
        uint256 totalAssetsNeeded = 0;

        for (uint256 i = 0; i < owners.length; i++) {
            uint256 shares = balanceOf(owners[i]);
            if (shares > 0) {
                totalAssetsNeeded += convertToAssets(shares);
            }
        }

        require(
            totalAssetsNeeded <= vaultBalance,
            "Insufficient vault liquidity"
        );
    }

    /**
     * @dev Internal helper to validate batch input parameters
     */
    function _validateBatchInputs(
        address[] calldata owners,
        address[] calldata receivers
    ) internal pure {
        require(owners.length == receivers.length, "Array length mismatch");
        require(owners.length > 0, "Empty arrays");
        require(owners.length <= 50, "Too many operations"); // Reduced from 100
    }

    // ============================================================================
    // EXTERNAL FUNCTIONS - ADMIN SETTERS
    // ============================================================================

    /**
     * @notice Sets the withdrawal cooldown period (admin only)
     * @param _cooldown The new cooldown period in seconds (max 30 days)
     */
    function setWithdrawalCooldown(
        uint256 _cooldown
    ) external onlyRole(ADMIN_ROLE) {
        // Combined bounds checking for gas optimization
        if (_cooldown > 30 days || _cooldown > type(uint48).max) {
            revert AdminParameterInvalid(
                "withdrawalCooldown",
                _cooldown,
                0,
                _cooldown > 30 days ? 30 days : type(uint48).max,
                "cooldown_exceeds_maximum_allowed"
            );
        }
        uint256 oldValue = withdrawalCooldown;
        withdrawalCooldown = _cooldown;
        emit WithdrawalCooldownUpdated(oldValue, _cooldown);
    }

    /**
     * @notice Sets the maximum deposit amount per user (admin only)
     * @param _maxUserDeposit The new maximum deposit amount per user
     */
    function setMaxUserDeposit(
        uint256 _maxUserDeposit
    ) external onlyRole(ADMIN_ROLE) {
        // Combined bounds checking for gas optimization
        if (_maxUserDeposit == 0 || _maxUserDeposit > MAX_SINGLE_DEPOSIT) {
            revert AdminParameterInvalid(
                "maxUserDeposit",
                _maxUserDeposit,
                1,
                MAX_SINGLE_DEPOSIT,
                "invalid_user_deposit_limit"
            );
        }
        uint256 oldValue = maxUserDeposit;
        maxUserDeposit = _maxUserDeposit;
        emit MaxUserDepositUpdated(oldValue, _maxUserDeposit);
    }

    /**
     * @notice Sets the maximum total deposits allowed in the vault (admin only)
     * @param _maxTotalDeposits The new maximum total deposit amount
     */
    function setMaxTotalDeposits(
        uint256 _maxTotalDeposits
    ) external onlyRole(ADMIN_ROLE) {
        // Combined bounds checking for gas optimization
        if (_maxTotalDeposits < maxUserDeposit || _maxTotalDeposits > MAX_TOTAL_ASSETS) {
            revert AdminParameterInvalid(
                "maxTotalDeposits",
                _maxTotalDeposits,
                maxUserDeposit,
                MAX_TOTAL_ASSETS,
                "invalid_total_deposit_limit"
            );
        }
        uint256 oldValue = maxTotalDeposits;
        maxTotalDeposits = _maxTotalDeposits;
        emit MaxTotalDepositsUpdated(oldValue, _maxTotalDeposits);
    }

    /**
     * @notice Sets the maximum NAV change allowed per update (admin only)
     * @param _maxNAVChange The new maximum NAV change in basis points (max 5000 = 50%)
     */
    function setMaxNAVChange(
        uint256 _maxNAVChange
    ) external onlyRole(ADMIN_ROLE) {
        require(_maxNAVChange <= 5000, "Max NAV change too high"); // Max 50%
        uint256 oldValue = maxNAVChange;
        maxNAVChange = _maxNAVChange;
        emit MaxNAVChangeUpdated(oldValue, _maxNAVChange);
    }

    /**
     * @notice Sets the delay between NAV updates and withdrawal eligibility (admin only)
     * @param _navUpdateDelay The new NAV update delay in seconds (max 24 hours)
     */
    function setNAVUpdateDelay(
        uint256 _navUpdateDelay
    ) external onlyRole(ADMIN_ROLE) {
        // Combined bounds checking for gas optimization
        if (_navUpdateDelay > 24 hours || _navUpdateDelay > type(uint48).max) {
            revert AdminParameterInvalid(
                "navUpdateDelay",
                _navUpdateDelay,
                0,
                _navUpdateDelay > 24 hours ? 24 hours : type(uint48).max,
                "delay_exceeds_maximum_allowed"
            );
        }
        uint256 oldValue = navUpdateDelay;
        navUpdateDelay = _navUpdateDelay;
        emit NAVUpdateDelayUpdated(oldValue, _navUpdateDelay);
    }

    /**
     * @notice Sets the treasury address for fund withdrawals (admin only)
     * @param _newTreasury The new treasury address (cannot be zero address)
     */
    function setTreasuryAddress(
        address _newTreasury
    ) external onlyRole(ADMIN_ROLE) {
        require(_newTreasury != address(0), "Treasury cannot be zero address");
        require(_newTreasury != treasuryAddress, "Treasury address unchanged");

        address oldTreasury = treasuryAddress;
        treasuryAddress = _newTreasury;
        emit TreasuryAddressUpdated(oldTreasury, _newTreasury, _msgSender());
    }

    /**
     * @notice Checks if a user can withdraw based on cooldown and other constraints
     * @param user The address to check withdrawal eligibility for
     * @return True if withdrawal is allowed, false otherwise
     */
    function canWithdraw(address user) public view returns (bool) {
        // Check deposit cooldown - primary flash loan protection
        bool depositCooldownMet = lastDepositTime[user] == 0 || 
            block.timestamp >= lastDepositTime[user] + withdrawalCooldown;

        // Check withdrawal rate limiting (1 minute between withdrawals)
        bool withdrawalRateLimitMet = lastWithdrawalTime[user] == 0 || 
            block.timestamp >= lastWithdrawalTime[user] + 1 minutes;

        // Check NAV update delay - prevent front-running
        bool navDelayMet = block.timestamp >= lastNAVChangeTime + navUpdateDelay;

        return depositCooldownMet && withdrawalRateLimitMet && navDelayMet;
    }

    /**
     * @notice Returns a complete breakdown of asset allocation
     * @return vaultBalance Assets physically in the vault
     * @return treasuryDeployed Assets deployed to treasury operations
     * @return totalManaged Total assets under management
     * @return utilizationRate Percentage of assets deployed (basis points, 10000 = 100%)
     */
    function getAssetAllocation() public view returns (
        uint256 vaultBalance,
        uint256 treasuryDeployed, 
        uint256 totalManaged,
        uint256 utilizationRate
    ) {
        vaultBalance = _getVaultBalance();
        totalManaged = totalAssetsManaged;
        
        if (vaultBalance >= totalManaged) {
            // No assets in treasury, possibly have excess yield
            treasuryDeployed = 0;
            utilizationRate = 0;
        } else {
            treasuryDeployed = totalManaged - vaultBalance;
            utilizationRate = totalManaged > 0 ? (treasuryDeployed * 10000) / totalManaged : 0;
        }
    }

    function _authorizeUpgrade(
        address newImplementation
    ) internal override onlyRole(UPGRADER_ROLE) {
        emit UpgradeAuthorized(
            _msgSender(),
            newImplementation,
            block.timestamp
        );
    }

    // Storage gap for future upgrades
    // Full 50 slots available for new deployments
    uint256[50] private __gap;
}
