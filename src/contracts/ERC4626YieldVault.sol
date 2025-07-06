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
import "@openzeppelin/contracts/utils/math/Math.sol";
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
    using Math for uint256;
    using SafeERC20Upgradeable for IERC20Upgradeable;
    using SafeCast for uint256;

    // Security constants for bounds checking (M-02 fix)
    uint256 private constant MAX_NAV_VALUE = 1e24; // Maximum NAV: 1,000,000 (with 18 decimals)
    uint256 private constant MIN_NAV_VALUE = 1e12; // Minimum NAV: 0.000001 (with 18 decimals)
    uint256 private constant MAX_TOTAL_ASSETS = 1e27; // Maximum total assets: 1 billion tokens (with 18 decimals)
    uint256 private constant MAX_SINGLE_DEPOSIT = 1e25; // Maximum single deposit: 10 million tokens
    uint256 private constant MAX_SHARES_SUPPLY = 1e27; // Maximum total shares that can exist

    // Roles
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");
    bytes32 public constant ORACLE_ROLE = keccak256("ORACLE_ROLE");
    bytes32 public constant TREASURY_ROLE = keccak256("TREASURY_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");
    bytes32 public constant UPGRADER_ROLE = keccak256("UPGRADER_ROLE");

    // Enhanced time constraint structure for M-02 fix
    struct TimeConstraint {
        uint48 timestamp; // Gas-optimized timestamp (uint48 from OpenZeppelin)
        uint32 blockNumber; // Block number for manipulation resistance
        uint48 tolerance; // Maximum acceptable timestamp deviation
    }

    // Constants for enhanced timing validation
    uint32 private constant WITHDRAWAL_DELAY_BLOCKS = 100; // ~20 minutes on most chains
    uint48 private constant WITHDRAWAL_DELAY_TIME = 1 hours; // User-friendly time
    uint48 private constant MAX_TIMESTAMP_DRIFT = 15 minutes; // Maximum clock drift tolerance
    uint48 private constant GRACE_PERIOD = 2 weeks; // Compound-style grace period

    // Core state
    uint256 public currentNAV; // Net Asset Value (18 decimals, starts at 1e18)
    uint256 public lastNAVUpdate;
    uint256 public totalAssetsManaged;
    address public treasuryAddress;

    // Business logic constraints
    uint256 public withdrawalCooldown; // e.g., 24 hours
    uint256 public maxUserDeposit;
    uint256 public maxTotalDeposits;
    uint256 public minReserveRatio; // e.g., 2000 = 20%

    // Enhanced time constraints (M-02 fix)
    mapping(address => TimeConstraint) public lastDepositConstraint;
    mapping(address => TimeConstraint) public lastWithdrawalConstraint;
    mapping(address => uint32) private lastCriticalActionBlock;
    mapping(address => uint256) public userDeposits;

    // Security enhancements
    uint256 public maxNAVChange; // Maximum NAV change per update (basis points)
    uint256 public navUpdateDelay; // Delay between NAV update and withdrawal eligibility
    uint256 public lastNAVChangeTime; // Last time NAV was changed significantly
    uint256 public maxTotalAssetsDeviation; // Maximum deviation for totalAssets validation (basis points)

    // Events
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
    event WithdrawalCooldownUpdated(uint256 oldValue, uint256 newValue);
    event MaxUserDepositUpdated(uint256 oldValue, uint256 newValue);
    event MaxTotalDepositsUpdated(uint256 oldValue, uint256 newValue);
    event MinReserveRatioUpdated(uint256 oldValue, uint256 newValue);
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

    // Enhanced events for overflow monitoring (M-02)
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

    // Enhanced events for timestamp monitoring (M-02)
    event TimestampValidationFailed(
        address indexed user,
        string reason,
        uint48 timestamp
    );
    event BlockValidationFailed(
        address indexed user,
        uint32 currentBlock,
        uint32 requiredBlock
    );
    event EmergencyTimestampBypass(address indexed user);

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
    event ReserveRatioViolation(
        address indexed user,
        uint256 attemptedWithdrawal,
        uint256 currentRatio,
        uint256 minimumRatio
    );

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
        minReserveRatio = 2000; // 20%

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

    // Override totalAssets to use our managed amount
    function totalAssets() public view override returns (uint256) {
        return totalAssetsManaged;
    }

    // Override conversion functions to use custom NAV logic with bounds checking (M-02 fix)
    function _convertToShares(
        uint256 assets,
        Math.Rounding rounding
    ) internal view returns (uint256) {
        // M-02: Explicit bounds checking for integer overflow protection
        if (assets > MAX_TOTAL_ASSETS) {
            // L-01: Emit bounds check event (view function can't emit, but we can revert with descriptive message)
            revert("Assets amount too large");
        }
        require(currentNAV >= MIN_NAV_VALUE, "NAV too low for conversion");
        require(currentNAV <= MAX_NAV_VALUE, "NAV too high for conversion");

        // Check for potential overflow in mulDiv operation
        // assets * 10^decimals should not overflow
        uint256 decimalsMultiplier = 10 ** decimals();
        if (assets > type(uint256).max / decimalsMultiplier) {
            revert("Assets would cause overflow in conversion");
        }

        uint256 shares = assets.mulDiv(
            decimalsMultiplier,
            currentNAV,
            rounding
        );

        // Ensure resulting shares don't exceed maximum supply limits
        require(
            shares <= MAX_SHARES_SUPPLY,
            "Converted shares exceed maximum supply"
        );

        return shares;
    }

    function _convertToAssets(
        uint256 shares,
        Math.Rounding rounding
    ) internal view returns (uint256) {
        // M-02: Explicit bounds checking for integer overflow protection
        if (shares > MAX_SHARES_SUPPLY) {
            revert("Shares amount too large");
        }
        require(currentNAV >= MIN_NAV_VALUE, "NAV too low for conversion");
        require(currentNAV <= MAX_NAV_VALUE, "NAV too high for conversion");

        // Check for potential overflow in mulDiv operation
        // shares * currentNAV should not overflow
        if (shares > type(uint256).max / currentNAV) {
            revert("Shares would cause overflow in conversion");
        }

        uint256 assets = shares.mulDiv(currentNAV, 10 ** decimals(), rounding);

        // Ensure resulting assets don't exceed reasonable limits
        require(
            assets <= MAX_TOTAL_ASSETS,
            "Converted assets exceed maximum limit"
        );

        return assets;
    }

    // Override max functions to respect our business limits
    function maxDeposit(
        address receiver
    ) public view override returns (uint256) {
        if (paused()) return 0;

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

    function maxMint(address receiver) public view override returns (uint256) {
        uint256 maxAssets = maxDeposit(receiver);
        return
            maxAssets == 0
                ? 0
                : _convertToShares(maxAssets, Math.Rounding.Down);
    }

    function maxWithdraw(address owner) public view override returns (uint256) {
        if (!canWithdraw(owner)) return 0;
        return super.maxWithdraw(owner);
    }

    function maxRedeem(address owner) public view override returns (uint256) {
        if (!canWithdraw(owner)) return 0;
        return super.maxRedeem(owner);
    }

    /**
     * @dev Mints shares to receiver by depositing assets
     * @param shares The amount of shares to mint
     * @param receiver The address to receive the shares
     * @return assets The amount of assets deposited
     */
    function mint(
        uint256 shares,
        address receiver
    ) public override whenNotPaused returns (uint256 assets) {
        require(shares > 0, "Cannot mint zero shares");
        require(shares <= maxMint(receiver), "ERC4626: mint more than max");

        assets = previewMint(shares);

        _deposit(_msgSender(), receiver, assets, shares);
        return assets;
    }

    /**
     * @dev Redeems shares for assets
     * @param shares The amount of shares to redeem
     * @param receiver The address to receive the assets
     * @param owner The owner of the shares
     * @return assets The amount of assets redeemed
     */
    function redeem(
        uint256 shares,
        address receiver,
        address owner
    ) public override whenNotPaused returns (uint256 assets) {
        // Allow zero shares for testing/edge cases
        if (shares == 0) {
            return 0;
        }

        require(shares <= maxRedeem(owner), "ERC4626: redeem more than max");

        assets = previewRedeem(shares);

        // Check withdrawal eligibility for non-zero redemptions
        require(canWithdraw(owner), "Withdrawal not allowed");

        _withdraw(_msgSender(), receiver, owner, assets, shares);
        return assets;
    }

    // Override deposit to add business logic with bounds checking (M-02 fix)
    function _deposit(
        address caller,
        address receiver,
        uint256 assets,
        uint256 shares
    ) internal override nonReentrant whenNotPaused {
        // M-02: Comprehensive bounds checking for deposits
        if (assets > MAX_SINGLE_DEPOSIT) {
            emit DepositLimitExceeded(
                receiver,
                assets,
                MAX_SINGLE_DEPOSIT,
                "Single deposit too large"
            );
            revert("Single deposit too large");
        }

        require(shares <= MAX_SHARES_SUPPLY, "Shares amount too large");

        // Per-user deposit limit with overflow protection
        require(
            userDeposits[receiver] <= MAX_TOTAL_ASSETS,
            "User deposits tracking corrupted"
        );

        if (userDeposits[receiver] > maxUserDeposit) {
            emit DepositLimitExceeded(
                receiver,
                userDeposits[receiver],
                maxUserDeposit,
                "User deposits exceed limit"
            );
            revert("User deposits exceed limit");
        }

        // Check for overflow before addition
        if (userDeposits[receiver] > maxUserDeposit - assets) {
            emit DepositLimitExceeded(
                receiver,
                userDeposits[receiver] + assets,
                maxUserDeposit,
                "Exceeds user limit"
            );
            revert("Exceeds user limit");
        }

        // Vault-wide deposit limit with overflow protection
        require(
            totalAssetsManaged <= MAX_TOTAL_ASSETS,
            "Total assets tracking corrupted"
        );
        if (totalAssetsManaged > maxTotalDeposits - assets) {
            emit DepositLimitExceeded(
                receiver,
                totalAssetsManaged + assets,
                maxTotalDeposits,
                "Exceeds vault limit"
            );
            revert("Exceeds vault limit");
        }

        super._deposit(caller, receiver, assets, shares);

        // Update our tracking with overflow protection
        uint256 newTotalAssets = totalAssetsManaged + assets;
        uint256 newUserDeposits = userDeposits[receiver] + assets;

        // Double-check no overflow occurred
        require(newTotalAssets >= totalAssetsManaged, "Total assets overflow");
        require(
            newUserDeposits >= userDeposits[receiver],
            "User deposits overflow"
        );

        totalAssetsManaged = newTotalAssets;
        userDeposits[receiver] = newUserDeposits;
        _updateUserActionTime(receiver, true); // true for deposit
    }

    // Override withdraw to add business logic with bounds checking (M-02 fix)
    function _withdraw(
        address caller,
        address receiver,
        address owner,
        uint256 assets,
        uint256 shares
    ) internal override nonReentrant whenNotPaused {
        // M-02: Bounds checking for withdrawals
        require(assets <= MAX_TOTAL_ASSETS, "Withdrawal amount too large");
        require(shares <= MAX_SHARES_SUPPLY, "Shares amount too large");

        // Allow zero-value operations to pass through without enhanced validation
        if (assets > 0) {
            // Enhanced withdrawal validation using multi-layer approach
            if (!canWithdraw(owner)) {
                // Check if it's a cooldown issue to emit specific event
                TimeConstraint memory lastWithdrawal = lastWithdrawalConstraint[
                    owner
                ];
                uint256 cooldownEnd = lastWithdrawal.timestamp +
                    withdrawalCooldown;

                if (block.timestamp < cooldownEnd) {
                    emit WithdrawalAttemptDuringCooldown(
                        owner,
                        assets,
                        cooldownEnd - block.timestamp
                    );
                }
                revert("Enhanced validation failed");
            }
        }

        // Reserve ratio enforcement (only for non-zero withdrawals)
        if (assets > 0) {
            uint256 vaultBalance = IERC20Upgradeable(asset()).balanceOf(
                address(this)
            );
            require(
                vaultBalance <= MAX_TOTAL_ASSETS,
                "Vault balance too large"
            );
            require(
                totalAssetsManaged <= MAX_TOTAL_ASSETS,
                "Total assets too large"
            );

            // Use safe arithmetic for reserve ratio calculation
            uint256 reserveRatio = totalAssetsManaged > 0
                ? vaultBalance.mulDiv(
                    10000,
                    totalAssetsManaged,
                    Math.Rounding.Down
                )
                : 10000;

            if (reserveRatio < minReserveRatio) {
                emit ReserveRatioViolation(
                    owner,
                    assets,
                    reserveRatio,
                    minReserveRatio
                );
                revert("Insufficient reserves");
            }
        }

        super._withdraw(caller, receiver, owner, assets, shares);

        // Update our tracking (only for non-zero withdrawals) with overflow protection
        if (assets > 0) {
            // Ensure no underflow in totalAssetsManaged
            require(totalAssetsManaged >= assets, "Total assets underflow");
            totalAssetsManaged -= assets;

            // Update user deposits with underflow protection
            if (userDeposits[owner] >= assets) {
                userDeposits[owner] -= assets;
            } else {
                userDeposits[owner] = 0;
            }
            _updateUserActionTime(owner, false); // false for withdrawal
        }
    }

    // Admin setters for business logic parameters with bounds checking (M-02 fix)
    function setWithdrawalCooldown(
        uint256 _cooldown
    ) external onlyRole(ADMIN_ROLE) {
        require(_cooldown <= 30 days, "Cooldown too long");
        // M-02: Additional bounds check to prevent overflow in time calculations
        require(
            _cooldown <= type(uint48).max,
            "Cooldown exceeds timestamp limits"
        );
        uint256 oldValue = withdrawalCooldown;
        withdrawalCooldown = _cooldown;
        emit WithdrawalCooldownUpdated(oldValue, _cooldown);
    }

    function setMaxUserDeposit(
        uint256 _maxUserDeposit
    ) external onlyRole(ADMIN_ROLE) {
        require(_maxUserDeposit > 0, "Max user deposit must be positive");
        // M-02: Bounds checking for deposit limits
        require(
            _maxUserDeposit <= MAX_SINGLE_DEPOSIT,
            "Max user deposit too large"
        );
        uint256 oldValue = maxUserDeposit;
        maxUserDeposit = _maxUserDeposit;
        emit MaxUserDepositUpdated(oldValue, _maxUserDeposit);
    }

    function setMaxTotalDeposits(
        uint256 _maxTotalDeposits
    ) external onlyRole(ADMIN_ROLE) {
        require(
            _maxTotalDeposits >= maxUserDeposit,
            "Max total deposits too low"
        );
        // M-02: Bounds checking for total deposit limits
        require(
            _maxTotalDeposits <= MAX_TOTAL_ASSETS,
            "Max total deposits too large"
        );
        uint256 oldValue = maxTotalDeposits;
        maxTotalDeposits = _maxTotalDeposits;
        emit MaxTotalDepositsUpdated(oldValue, _maxTotalDeposits);
    }

    function setMinReserveRatio(
        uint256 _minReserveRatio
    ) external onlyRole(ADMIN_ROLE) {
        require(_minReserveRatio <= 10000, "Reserve ratio too high");
        uint256 oldValue = minReserveRatio;
        minReserveRatio = _minReserveRatio;
        emit MinReserveRatioUpdated(oldValue, _minReserveRatio);
    }

    function setMaxNAVChange(
        uint256 _maxNAVChange
    ) external onlyRole(ADMIN_ROLE) {
        require(_maxNAVChange <= 5000, "Max NAV change too high"); // Max 50%
        uint256 oldValue = maxNAVChange;
        maxNAVChange = _maxNAVChange;
        emit MaxNAVChangeUpdated(oldValue, _maxNAVChange);
    }

    function setNAVUpdateDelay(
        uint256 _navUpdateDelay
    ) external onlyRole(ADMIN_ROLE) {
        require(_navUpdateDelay <= 24 hours, "Delay too long");
        // M-02: Additional bounds check to prevent overflow in time calculations
        require(
            _navUpdateDelay <= type(uint48).max,
            "Delay exceeds timestamp limits"
        );
        uint256 oldValue = navUpdateDelay;
        navUpdateDelay = _navUpdateDelay;
        emit NAVUpdateDelayUpdated(oldValue, _navUpdateDelay);
    }

    // L-01: Missing treasury address setter function
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
     * @dev Enhanced time validation using both timestamp and block number
     * Follows patterns from Compound Timelock and Aave V3
     */
    function isTimeConstraintMet(
        TimeConstraint memory constraint,
        uint256 delay
    ) internal view returns (bool) {
        uint48 currentTime = uint48(block.timestamp);
        uint32 currentBlock = uint32(block.number);

        // Primary check: timestamp validation with grace period
        bool timestampMet = currentTime >= constraint.timestamp + delay;
        bool withinGracePeriod = currentTime <=
            constraint.timestamp + delay + GRACE_PERIOD;

        // Secondary check: block number (manipulation-resistant)
        // Assuming average block time for the network (12s for Ethereum, 3s for BSC)
        uint256 expectedBlocks = delay / getAverageBlockTime();
        bool blockMet = currentBlock >= constraint.blockNumber + expectedBlocks;

        // Clock drift protection
        bool timestampValid = _isTimestampValid(
            currentTime,
            uint48(constraint.timestamp + delay)
        );

        // All conditions must be met for security
        return timestampMet && blockMet && withinGracePeriod && timestampValid;
    }

    /**
     * @dev Validates timestamp against manipulation
     * Inspired by Uniswap V3 oracle timestamp validation
     */
    function _isTimestampValid(
        uint48 current,
        uint48 target
    ) internal view returns (bool) {
        // Prevent future timestamps beyond reasonable drift
        if (current > target + MAX_TIMESTAMP_DRIFT) return false;

        // Ensure timestamp is not unreasonably far in the past
        if (target > current + MAX_TIMESTAMP_DRIFT) return false;

        return true;
    }

    /**
     * @dev Get average block time for the current network
     * Returns block time in seconds
     */
    function getAverageBlockTime() internal view returns (uint256) {
        uint256 chainId = block.chainid;
        if (chainId == 1) return 12; // Ethereum mainnet
        if (chainId == 56) return 3; // BSC mainnet
        if (chainId == 97) return 3; // BSC testnet
        if (chainId == 1337) return 1; // Hardhat local
        return 12; // Default to Ethereum timing
    }

    /**
     * @dev Critical operations use block number validation only
     * Similar to Aave's approach for liquidations and other MEV-sensitive operations
     */
    function isCriticalActionAllowed(
        address user
    ) internal view returns (bool) {
        return
            uint32(block.number) >=
            lastCriticalActionBlock[user] + WITHDRAWAL_DELAY_BLOCKS;
    }

    /**
     * @dev Update time constraints with both timestamp and block number
     */
    function _updateTimeConstraint(
        address user,
        mapping(address => TimeConstraint) storage constraintMap
    ) internal {
        constraintMap[user] = TimeConstraint({
            timestamp: uint48(block.timestamp),
            blockNumber: uint32(block.number),
            tolerance: MAX_TIMESTAMP_DRIFT
        });
    }

    /**
     * @dev Update user action timestamps (called on deposits/withdrawals)
     */
    function _updateUserActionTime(address user, bool isDeposit) internal {
        if (isDeposit) {
            _updateTimeConstraint(user, lastDepositConstraint);
        } else {
            _updateTimeConstraint(user, lastWithdrawalConstraint);
            // Critical actions (withdrawals) also update block-based constraint
            lastCriticalActionBlock[user] = uint32(block.number);
        }
    }

    /**
     * @dev Emergency timestamp validation bypass (admin only)
     * For use in case of network issues or extreme timestamp manipulation
     */
    function emergencyBypassTimestamp(
        address user
    ) external onlyRole(ADMIN_ROLE) {
        lastCriticalActionBlock[user] =
            uint32(block.number) -
            WITHDRAWAL_DELAY_BLOCKS;
        emit EmergencyTimestampBypass(user);
    }

    // View function to check if withdrawal is allowed
    function canWithdraw(address user) public view returns (bool) {
        // Layer 1: Standard time constraint validation
        // If user has never deposited, allow withdrawal (they have no balance anyway)
        bool depositConstraintMet = lastDepositConstraint[user].timestamp ==
            0 ||
            uint48(block.timestamp) >=
            lastDepositConstraint[user].timestamp + withdrawalCooldown;

        // If user has never withdrawn before, allow withdrawal (no rate limiting needed)
        bool withdrawalConstraintMet = lastWithdrawalConstraint[user]
            .timestamp ==
            0 ||
            uint48(block.timestamp) >=
            lastWithdrawalConstraint[user].timestamp + 1 minutes;

        // Layer 2: Critical action block-based validation (MEV protection)
        // If user has never performed critical actions, allow them to start
        bool criticalActionAllowed = lastCriticalActionBlock[user] == 0 ||
            uint32(block.number) >=
            lastCriticalActionBlock[user] + WITHDRAWAL_DELAY_BLOCKS;

        // Layer 3: NAV update protection - simplified for now
        bool navConstraintMet = uint48(block.timestamp) >=
            lastNAVChangeTime + navUpdateDelay;

        return
            depositConstraintMet &&
            withdrawalConstraintMet &&
            criticalActionAllowed &&
            navConstraintMet;
    }

    // View function to get time until withdrawal is allowed
    function timeUntilWithdrawal(address user) external view returns (uint256) {
        uint256 cooldownEnd = lastDepositConstraint[user].timestamp +
            withdrawalCooldown;
        uint256 navDelayEnd = lastNAVChangeTime + navUpdateDelay;
        uint256 withdrawalDelayEnd = lastWithdrawalConstraint[user].timestamp +
            1 minutes;

        // Also check block-based constraint
        uint256 blockDelayEnd = (lastCriticalActionBlock[user] +
            WITHDRAWAL_DELAY_BLOCKS) * getAverageBlockTime();

        uint256 maxEnd = cooldownEnd > navDelayEnd ? cooldownEnd : navDelayEnd;
        maxEnd = maxEnd > withdrawalDelayEnd ? maxEnd : withdrawalDelayEnd;
        maxEnd = maxEnd > blockDelayEnd ? maxEnd : blockDelayEnd;

        return block.timestamp >= maxEnd ? 0 : maxEnd - block.timestamp;
    }

    function updateNAV(
        uint256 newNAV,
        uint256 newTotalAssets
    ) external onlyRole(ORACLE_ROLE) whenNotPaused {
        require(newNAV > 0, "NAV must be positive");
        require(
            newTotalAssets <= MAX_TOTAL_ASSETS,
            "Total assets exceed maximum limit"
        );
        require(
            block.timestamp >= lastNAVUpdate + 6 hours,
            "Update too frequent"
        );

        // Calculate NAV change percentage once (eliminates 3 duplicate calculations)
        uint256 changePercentage = _calculateNAVChangePercentage(newNAV);

        // Consolidated validation with helper functions
        _validateNAVBounds(newNAV, changePercentage);
        _validateNAVChangeConstraints(newNAV, changePercentage);
        _validateTotalAssetsConstraints(newTotalAssets);
        _validateConversionOverflows(newNAV, newTotalAssets);

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
     * @dev Validate NAV is within allowed bounds
     * @param newNAV The proposed new NAV value
     * @param changePercentage The calculated change percentage
     */
    function _validateNAVBounds(
        uint256 newNAV,
        uint256 changePercentage
    ) internal {
        if (newNAV < MIN_NAV_VALUE || newNAV > MAX_NAV_VALUE) {
            emit NAVChangeRejected(
                msg.sender,
                newNAV,
                currentNAV,
                changePercentage,
                0
            );
            revert("NAV outside allowed bounds");
        }
    }

    /**
     * @dev Validate NAV change is within acceptable limits
     * @param newNAV The proposed new NAV value
     * @param changePercentage The calculated change percentage
     */
    function _validateNAVChangeConstraints(
        uint256 newNAV,
        uint256 changePercentage
    ) internal {
        if (currentNAV > 0 && changePercentage > maxNAVChange) {
            emit NAVChangeRejected(
                msg.sender,
                newNAV,
                currentNAV,
                changePercentage,
                maxNAVChange
            );
            revert("NAV change too large");
        }
    }

    /**
     * @dev Validate total assets constraints with overflow protection
     * @param newTotalAssets The proposed new total assets value
     */
    function _validateTotalAssetsConstraints(
        uint256 newTotalAssets
    ) internal view {
        uint256 vaultBalance = IERC20Upgradeable(asset()).balanceOf(
            address(this)
        );
        require(
            vaultBalance <= MAX_TOTAL_ASSETS,
            "Vault balance exceeds maximum"
        );

        if (totalAssetsManaged > 0) {
            require(
                totalAssetsManaged <= MAX_TOTAL_ASSETS,
                "Current total assets too large"
            );
            require(
                maxTotalAssetsDeviation <= 10000,
                "Deviation percentage invalid"
            );

            uint256 maxDeviation = totalAssetsManaged.mulDiv(
                maxTotalAssetsDeviation,
                10000,
                Math.Rounding.Up
            );
            uint256 maxAllowedAssets = totalAssetsManaged >
                type(uint256).max - maxDeviation
                ? type(uint256).max
                : totalAssetsManaged + maxDeviation;

            require(
                newTotalAssets >= vaultBalance &&
                    newTotalAssets <= maxAllowedAssets,
                "Total assets validation failed"
            );
        }
    }

    /**
     * @dev Validate NAV update won't cause conversion overflows
     * @param newNAV The proposed new NAV value
     * @param newTotalAssets The proposed new total assets value
     */
    function _validateConversionOverflows(
        uint256 newNAV,
        uint256 newTotalAssets
    ) internal view {
        if (newTotalAssets > 0 && totalSupply() > 0) {
            uint256 testAssets = 1e18; // 1 token
            require(
                testAssets <= type(uint256).max / (10 ** decimals()),
                "NAV would cause share conversion overflow"
            );
            require(
                testAssets.mulDiv(
                    10 ** decimals(),
                    newNAV,
                    Math.Rounding.Down
                ) > 0,
                "NAV would cause precision loss"
            );

            uint256 testShares = 1e18; // 1 share
            require(
                testShares <= type(uint256).max / newNAV,
                "NAV would cause asset conversion overflow"
            );
        }
    }

    // Treasury withdrawal
    function withdrawToTreasury(
        uint256 amount
    ) external onlyRole(TREASURY_ROLE) whenNotPaused {
        require(amount > 0, "Zero amount");
        uint256 vaultBalance = IERC20Upgradeable(asset()).balanceOf(
            address(this)
        );
        require(amount <= vaultBalance, "Insufficient balance");
        IERC20Upgradeable(asset()).safeTransfer(treasuryAddress, amount);
        emit TreasuryWithdrawal(treasuryAddress, amount, vaultBalance - amount);
    }

    function pause() external onlyRole(PAUSER_ROLE) {
        _pause(); // Emits standard Paused(address) event
    }

    function unpause() external onlyRole(ADMIN_ROLE) {
        _unpause(); // Emits standard Unpaused(address) event
    }

    // Unified batch withdrawal for emergency and administrative purposes
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

        // Reserve ratio check (only for non-emergency)
        if (!emergency) {
            _validateBatchReserveRatio(totalAssetsWithdrawn);
        }

        emit BatchWithdrawal(
            _msgSender(),
            totalAssetsWithdrawn,
            totalSharesBurned
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

    /**
     * @dev Internal helper to validate batch liquidity requirements
     */
    function _validateBatchLiquidity(address[] calldata owners) internal view {
        uint256 vaultBalance = IERC20Upgradeable(asset()).balanceOf(
            address(this)
        );
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

        _updateUserActionTime(owner, false);

        emit Withdraw(_msgSender(), receiver, owner, assets, shares);
    }

    /**
     * @dev Internal helper to validate reserve ratio after batch withdrawal
     */
    function _validateBatchReserveRatio(
        uint256 totalAssetsWithdrawn
    ) internal view {
        uint256 vaultBalance = IERC20Upgradeable(asset()).balanceOf(
            address(this)
        );
        uint256 remainingBalance = vaultBalance - totalAssetsWithdrawn;

        if (totalAssetsManaged > 0) {
            uint256 reserveRatio = (remainingBalance * 10000) /
                totalAssetsManaged;
            require(
                reserveRatio >= minReserveRatio,
                "Would violate reserve ratio"
            );
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
