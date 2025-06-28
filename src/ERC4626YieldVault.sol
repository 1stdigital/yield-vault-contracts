// SPDX-License-Identifier: MIT
pragma solidity 0.8.21;

import "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/ERC4626Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";

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

    // Roles
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");
    bytes32 public constant ORACLE_ROLE = keccak256("ORACLE_ROLE");
    bytes32 public constant TREASURY_ROLE = keccak256("TREASURY_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");
    bytes32 public constant UPGRADER_ROLE = keccak256("UPGRADER_ROLE");

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
    mapping(address => uint256) public lastDepositTime;
    mapping(address => uint256) public userDeposits;

    // Security enhancements
    uint256 public maxNAVChange; // Maximum NAV change per update (basis points)
    uint256 public navUpdateDelay; // Delay between NAV update and withdrawal eligibility
    uint256 public lastNAVChangeTime; // Last time NAV was changed significantly
    uint256 public maxTotalAssetsDeviation; // Maximum deviation for totalAssets validation (basis points)
    mapping(address => uint256) public lastWithdrawalTime; // For front-running protection

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
    event TokenNameUpdated(string oldName, string newName);
    event TokenSymbolUpdated(string oldSymbol, string newSymbol);
    event SlippageProtectionTriggered(
        address indexed user,
        uint256 expectedShares,
        uint256 actualShares
    );
    event BatchWithdrawal(
        address indexed admin,
        uint256 totalAssets,
        uint256 totalShares,
        uint256 userCount
    );

    /// @custom:oz-upgrades-unsafe-allow constructor
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

    // Override conversion functions to use custom NAV logic
    function _convertToShares(
        uint256 assets,
        Math.Rounding rounding
    ) internal view returns (uint256) {
        return assets.mulDiv(10 ** decimals(), currentNAV, rounding);
    }

    function _convertToAssets(
        uint256 shares,
        Math.Rounding rounding
    ) internal view returns (uint256) {
        return shares.mulDiv(currentNAV, 10 ** decimals(), rounding);
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

    // Override deposit to add business logic
    function _deposit(
        address caller,
        address receiver,
        uint256 assets,
        uint256 shares
    ) internal override nonReentrant whenNotPaused {
        // Per-user deposit limit
        require(
            userDeposits[receiver] + assets <= maxUserDeposit,
            "Exceeds user limit"
        );
        // Vault-wide deposit limit
        require(
            totalAssetsManaged + assets <= maxTotalDeposits,
            "Exceeds vault limit"
        );

        super._deposit(caller, receiver, assets, shares);

        // Update our tracking
        totalAssetsManaged += assets;
        userDeposits[receiver] += assets;
        lastDepositTime[receiver] = block.timestamp;
    }

    // Override withdraw to add business logic
    function _withdraw(
        address caller,
        address receiver,
        address owner,
        uint256 assets,
        uint256 shares
    ) internal override nonReentrant whenNotPaused {
        // Cooldown enforcement
        require(
            block.timestamp >= lastDepositTime[owner] + withdrawalCooldown,
            "Cooldown not passed"
        );

        // Front-running protection: delay after significant NAV change
        require(
            block.timestamp >= lastNAVChangeTime + navUpdateDelay,
            "NAV update delay not passed"
        );

        // Anti-MEV: minimum time between withdrawals
        require(
            block.timestamp >= lastWithdrawalTime[owner] + 1 minutes,
            "Withdrawal too frequent"
        );

        // Reserve ratio enforcement
        uint256 vaultBalance = IERC20(asset()).balanceOf(address(this));
        uint256 reserveRatio = totalAssetsManaged > 0
            ? (vaultBalance * 10000) / totalAssetsManaged
            : 10000;
        require(reserveRatio >= minReserveRatio, "Insufficient reserves");

        super._withdraw(caller, receiver, owner, assets, shares);

        // Update our tracking
        totalAssetsManaged -= assets;
        if (userDeposits[owner] >= assets) {
            userDeposits[owner] -= assets;
        } else {
            userDeposits[owner] = 0;
        }
        lastWithdrawalTime[owner] = block.timestamp;
    }

    // Admin setters for business logic parameters
    function setWithdrawalCooldown(
        uint256 _cooldown
    ) external onlyRole(ADMIN_ROLE) {
        require(_cooldown <= 30 days, "Cooldown too long");
        uint256 oldValue = withdrawalCooldown;
        withdrawalCooldown = _cooldown;
        emit WithdrawalCooldownUpdated(oldValue, _cooldown);
    }

    function setMaxUserDeposit(
        uint256 _maxUserDeposit
    ) external onlyRole(ADMIN_ROLE) {
        require(_maxUserDeposit > 0, "Max user deposit must be positive");
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
        uint256 oldValue = navUpdateDelay;
        navUpdateDelay = _navUpdateDelay;
        emit NAVUpdateDelayUpdated(oldValue, _navUpdateDelay);
    }

    // Custom name and symbol storage to allow updates
    string private _customName;
    string private _customSymbol;

    function setTokenName(
        string memory _newName
    ) external onlyRole(ADMIN_ROLE) {
        require(bytes(_newName).length > 0, "Name cannot be empty");
        string memory oldName = name();
        _customName = _newName;
        emit TokenNameUpdated(oldName, _newName);
    }

    function setTokenSymbol(
        string memory _newSymbol
    ) external onlyRole(ADMIN_ROLE) {
        require(bytes(_newSymbol).length > 0, "Symbol cannot be empty");
        string memory oldSymbol = symbol();
        _customSymbol = _newSymbol;
        emit TokenSymbolUpdated(oldSymbol, _newSymbol);
    }

    // Override name() to return custom name if set
    function name()
        public
        view
        override(ERC20Upgradeable, IERC20MetadataUpgradeable)
        returns (string memory)
    {
        if (bytes(_customName).length > 0) {
            return _customName;
        }
        return super.name();
    }

    // Override symbol() to return custom symbol if set
    function symbol()
        public
        view
        override(ERC20Upgradeable, IERC20MetadataUpgradeable)
        returns (string memory)
    {
        if (bytes(_customSymbol).length > 0) {
            return _customSymbol;
        }
        return super.symbol();
    }

    // View function to check if withdrawal is allowed
    function canWithdraw(address user) public view returns (bool) {
        return
            block.timestamp >= lastDepositTime[user] + withdrawalCooldown &&
            block.timestamp >= lastNAVChangeTime + navUpdateDelay &&
            block.timestamp >= lastWithdrawalTime[user] + 1 minutes;
    }

    // View function to get time until withdrawal is allowed
    function timeUntilWithdrawal(address user) external view returns (uint256) {
        uint256 cooldownEnd = lastDepositTime[user] + withdrawalCooldown;
        uint256 navDelayEnd = lastNAVChangeTime + navUpdateDelay;
        uint256 withdrawalDelayEnd = lastWithdrawalTime[user] + 1 minutes;

        uint256 maxEnd = cooldownEnd > navDelayEnd ? cooldownEnd : navDelayEnd;
        maxEnd = maxEnd > withdrawalDelayEnd ? maxEnd : withdrawalDelayEnd;
        return block.timestamp >= maxEnd ? 0 : maxEnd - block.timestamp;
    }

    // NAV update (oracle)
    function updateNAV(
        uint256 newNAV,
        uint256 newTotalAssets
    ) external onlyRole(ORACLE_ROLE) whenNotPaused {
        require(newNAV > 0, "NAV must be positive");
        require(
            block.timestamp >= lastNAVUpdate + 6 hours,
            "Update too frequent"
        );

        // Validate NAV change is within acceptable limits
        if (currentNAV > 0) {
            uint256 navChange = newNAV > currentNAV
                ? ((newNAV - currentNAV) * 10000) / currentNAV
                : ((currentNAV - newNAV) * 10000) / currentNAV;

            require(navChange <= maxNAVChange, "NAV change too large");

            // Track significant NAV changes for front-running protection
            if (navChange > 100) {
                // More than 1% change
                lastNAVChangeTime = block.timestamp;
            }
        }

        // Validate totalAssets makes sense relative to vault balance
        uint256 vaultBalance = IERC20(asset()).balanceOf(address(this));
        if (totalAssetsManaged > 0) {
            uint256 expectedRange = (totalAssetsManaged *
                maxTotalAssetsDeviation) / 10000;
            require(
                newTotalAssets >= vaultBalance &&
                    newTotalAssets <= totalAssetsManaged + expectedRange,
                "Total assets validation failed"
            );
        }

        uint256 oldNAV = currentNAV;
        currentNAV = newNAV;
        totalAssetsManaged = newTotalAssets;
        lastNAVUpdate = block.timestamp;
        emit NAVUpdated(oldNAV, newNAV, newTotalAssets, block.timestamp);
    }

    // Treasury withdrawal
    function withdrawToTreasury(
        uint256 amount
    ) external onlyRole(TREASURY_ROLE) whenNotPaused {
        require(amount > 0, "Zero amount");
        uint256 vaultBalance = IERC20(asset()).balanceOf(address(this));
        require(amount <= vaultBalance, "Insufficient balance");
        IERC20(asset()).transfer(treasuryAddress, amount);
        emit TreasuryWithdrawal(treasuryAddress, amount, vaultBalance - amount);
    }

    // Pause/unpause
    function pause() external onlyRole(PAUSER_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(ADMIN_ROLE) {
        _unpause();
    }

    // Batch withdrawal for emergency or administrative purposes
    function batchWithdraw(
        address[] calldata owners,
        uint256[] calldata shareAmounts,
        address[] calldata receivers
    ) external onlyRole(ADMIN_ROLE) nonReentrant whenNotPaused {
        require(owners.length == shareAmounts.length, "Array length mismatch");
        require(owners.length == receivers.length, "Array length mismatch");
        require(owners.length > 0, "Empty arrays");
        require(owners.length <= 100, "Too many operations");

        uint256 totalAssetsWithdrawn = 0;
        uint256 totalSharesBurned = 0;

        // Check vault has enough liquidity for all withdrawals
        uint256 vaultBalance = IERC20(asset()).balanceOf(address(this));
        uint256 totalAssetsNeeded = 0;
        for (uint256 i = 0; i < owners.length; i++) {
            totalAssetsNeeded += convertToAssets(shareAmounts[i]);
        }
        require(
            totalAssetsNeeded <= vaultBalance,
            "Insufficient vault liquidity"
        );

        // Process each withdrawal
        for (uint256 i = 0; i < owners.length; i++) {
            address owner = owners[i];
            uint256 shares = shareAmounts[i];
            address receiver = receivers[i];

            require(shares > 0, "Zero shares");
            require(balanceOf(owner) >= shares, "Insufficient shares");

            uint256 assets = convertToAssets(shares);

            // Admin batch withdrawals bypass cooldowns for emergency situations
            _burn(owner, shares);
            IERC20(asset()).transfer(receiver, assets);

            // Update user tracking
            if (userDeposits[owner] >= assets) {
                userDeposits[owner] -= assets;
            } else {
                userDeposits[owner] = 0;
            }

            lastWithdrawalTime[owner] = block.timestamp;

            totalAssetsWithdrawn += assets;
            totalSharesBurned += shares;

            emit Withdraw(msg.sender, receiver, owner, assets, shares);
        }

        // Update vault state
        totalAssetsManaged -= totalAssetsWithdrawn;

        // Final reserve ratio check
        uint256 remainingBalance = vaultBalance - totalAssetsWithdrawn;
        if (totalAssetsManaged > 0) {
            uint256 reserveRatio = (remainingBalance * 10000) /
                totalAssetsManaged;
            require(
                reserveRatio >= minReserveRatio,
                "Would violate reserve ratio"
            );
        }

        emit BatchWithdrawal(
            msg.sender,
            totalAssetsWithdrawn,
            totalSharesBurned,
            owners.length
        );
    }

    // Emergency batch withdrawal - bypasses all restrictions except reserve ratio
    function emergencyBatchWithdraw(
        address[] calldata owners,
        address[] calldata receivers
    ) external onlyRole(ADMIN_ROLE) nonReentrant {
        require(owners.length == receivers.length, "Array length mismatch");
        require(owners.length > 0, "Empty arrays");
        require(owners.length <= 100, "Too many operations");

        uint256 totalAssetsWithdrawn = 0;
        uint256 totalSharesBurned = 0;

        for (uint256 i = 0; i < owners.length; i++) {
            address owner = owners[i];
            address receiver = receivers[i];
            uint256 shares = balanceOf(owner);

            if (shares == 0) continue; // Skip accounts with no shares

            uint256 assets = convertToAssets(shares);

            _burn(owner, shares);
            IERC20(asset()).transfer(receiver, assets);

            userDeposits[owner] = 0; // Reset user deposits
            lastWithdrawalTime[owner] = block.timestamp;

            totalAssetsWithdrawn += assets;
            totalSharesBurned += shares;

            emit Withdraw(msg.sender, receiver, owner, assets, shares);
        }

        totalAssetsManaged -= totalAssetsWithdrawn;
        emit BatchWithdrawal(
            msg.sender,
            totalAssetsWithdrawn,
            totalSharesBurned,
            owners.length
        );
    }

    // UUPS upgrade authorization
    function _authorizeUpgrade(
        address newImplementation
    ) internal override onlyRole(UPGRADER_ROLE) {}

    // Storage gap for future upgrades
    // Full 50 slots for new deployments (includes _customName and _customSymbol in the gap)
    uint256[50] private __gap;
}
