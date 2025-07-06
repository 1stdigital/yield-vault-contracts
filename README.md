# ERC4626 Yield Vault Smart Contracts

This repository contains a smart contract for a yield-bearing vault based on the ERC-4626 standard, providing a comprehensive implementation with advanced security features and business logic.

## Repository Structure

This is a standalone repository containing the smart contract implementation. 

## Features

- ✅ **ERC-4626 Compliance**: Standard tokenized vault interface with integrated share token
- ✅ **Upgradeable Architecture**: UUPS proxy pattern for future updates
- ✅ **Role-Based Access Control**: Multiple admin roles (ADMIN, ORACLE, TREASURY, PAUSER, UPGRADER)
- ✅ **Advanced Security**: Reentrancy protection, front-running protection, MEV resistance
- ✅ **Economic Safeguards**: Deposit limits, withdrawal cooldowns, reserve ratio enforcement
- ✅ **Custom NAV Management**: Oracle-driven Net Asset Value updates with validation
- ✅ **Emergency Controls**: Pause/unpause functionality and batch operations
- ✅ **Parameter Flexibility**: Dynamic configuration of limits and operational parameters

## Contract

### Core Contract
- **`ERC4626YieldVault.sol`**: EIP-4626 compliant vault with integrated share token functionality

## Security Features

- **Reentrancy Protection**: All critical functions protected with ReentrancyGuard
- **Role-Based Access Control**: Granular permissions with 5 distinct roles
- **Parameter Validation**: Comprehensive input validation and bounds checking
- **Economic Safeguards**: Deposit limits, withdrawal cooldowns, NAV change limits
- **Front-Running Protection**: NAV update delays and withdrawal frequency limits
- **MEV Resistance**: Anti-MEV mechanisms to protect user transactions
- **Emergency Response**: Pause functionality and batch operations for crisis management
- **Upgrade Security**: Protected UUPS upgrade mechanism with role restrictions

## Dependencies

### OpenZeppelin Contracts Upgradeable
- **ERC4626Upgradeable**: Standard tokenized vault implementation
- **AccessControlUpgradeable**: Role-based access control system
- **PausableUpgradeable**: Emergency pause functionality
- **ReentrancyGuardUpgradeable**: Protection against reentrancy attacks
- **UUPSUpgradeable**: Upgradeable proxy pattern implementation

### Development Environment
- **Hardhat**: Ethereum development environment with plugin ecosystem
- **TypeChain**: Type-safe contract interactions for TypeScript
- **Solidity 0.8.21**: Latest stable compiler with optimization enabled

## Getting Started

### Prerequisites

- Node.js >= 16.0.0
- npm or yarn
- Git

### Installation

```bash
# Clone the repository
git clone https://github.com/1stdigital/yield-vault-contracts.git
cd yield-vault-contracts

# Install dependencies
npm install

# Copy environment file and configure (optional)
cp .env.example .env
# Edit .env with your configuration if needed
```

### Development

```bash
# Compile contracts
npm run build

# Start local blockchain
npm run dev

# Deploy to local network (when deployment scripts are added)
npm run deploy:local

# Run tests (when test suites are added)
npm test
```

### Project Structure

```
├── src/                      # Smart contract source files
│   └── ERC4626YieldVault.sol # Main ERC-4626 compliant vault contract
├── scripts/                  # Deployment and interaction scripts (to be added)
├── test/                     # Test suites (to be added)
├── hardhat.config.js        # Hardhat configuration
├── package.json             # Dependencies and scripts
└── README.md                # This file
```

## Deployment

### Local Development

### Network Configuration

Currently configured for:
- **Local**: Hardhat network (development)
- **BSC Testnet**: Configuration ready (deployment to be implemented)
- **BSC Mainnet**: Configuration ready (deployment to be implemented)

**⚠️ IMPORTANT**: Production deployments require proper testing and security audits.

## Usage Examples

### Basic Vault Interactions

```javascript
// Initialize vault (admin operation)
await vault.initialize(assetToken, "Vault Shares", "vSHR", treasury, admin);

// Deposit assets (user operation)
await assetToken.approve(vault.address, depositAmount);
await vault.deposit(depositAmount, userAddress);

// Check shares received
const shares = await vault.balanceOf(userAddress);

// Withdraw after cooldown period
await vault.withdraw(assetAmount, userAddress, userAddress);
```

### Administrative Operations

```javascript
// Update NAV (Oracle role required)
await vault.updateNAV(newNAV, newTotalAssets);

// Emergency pause (Pauser role required)
await vault.pause();

// Update parameters (Admin role required)
await vault.setWithdrawalCooldown(newCooldownPeriod);
await vault.setMaxUserDeposit(newMaxDeposit);
```

## Security Considerations

### Access Control Roles

- **`DEFAULT_ADMIN_ROLE`**: Can grant/revoke all roles, upgrade contracts
- **`ORACLE_ROLE`**: Can update NAV and total assets
- **`TREASURY_ROLE`**: Can withdraw funds for management
- **`PAUSER_ROLE`**: Can pause contract in emergencies
- **`UPGRADER_ROLE`**: Can authorize contract upgrades

### Key Security Parameters

1. **Withdrawal Cooldown**: Prevents flash loan attacks (default: 24 hours)
2. **NAV Change Limits**: Prevents extreme manipulation (default: ±15%)
3. **Deposit Limits**: Per-user and vault-wide deposit limits
4. **Reserve Ratio**: Minimum reserve requirements (default: 20%)
5. **NAV Update Delay**: Protection against front-running (default: 1 hour)

### Best Practices for Production

- Use multi-signature wallets for all admin roles
- Implement timelocks for critical parameter changes
- Monitor for unusual transaction patterns and MEV activity
- Conduct regular security audits and penetration testing
- Maintain comprehensive emergency response procedures
- Test all operations thoroughly on testnets before mainnet deployment

## Integration with Other Projects

### Using as Git Submodule

To include these contracts in another project as a git submodule:

```bash
# Add as submodule in your main project
git submodule add https://github.com/1stdigital/yield-vault-contracts.git contracts

# Initialize and update submodule
git submodule update --init --recursive

# To update to latest contracts version
cd contracts
git pull origin main
cd ..
git add contracts
git commit -m "Update contracts submodule"
```

### Using as NPM Package

You can also install this as an npm package (once published):

```bash
npm install @1stdigital/yield-vault-contracts
```

Then import the contracts in your project:

```solidity
import "@1stdigital/yield-vault-contracts/src/ERC4626YieldVault.sol";
```

## Contributing

### Development Guidelines

1. **Security First**: Follow security-first development practices
2. **Test Coverage**: Write comprehensive tests for all changes (when test framework is added)
3. **Code Quality**: Maintain clean, well-documented code
4. **Gas Optimization**: Consider gas efficiency in implementations
5. **Documentation**: Update README and inline comments for changes

### Contributing Workflow

1. Fork the repository
2. Create a feature branch
3. Implement changes with proper documentation
4. Test thoroughly on local network
5. Submit pull request with detailed description

## Future Development

This repository will be expanded with:

- Comprehensive test suites for security and functionality
- Deployment scripts for various networks
- Integration examples and documentation
- Additional utility contracts and libraries
- Governance and timelock mechanisms

See `SECURITY_REPORT.md` for detailed security analysis (to be added).

## License

MIT License - see LICENSE file for details.

## Disclaimer

These smart contracts are for development and testing purposes. Production deployment requires:

1. Professional security audit
2. Comprehensive testing on testnets
3. Legal and regulatory compliance review
4. Proper operational procedures
5. Multi-signature wallet setup for admin roles

**DO NOT DEPLOY TO MAINNET WITHOUT PROPER AUDITING AND APPROVAL**
