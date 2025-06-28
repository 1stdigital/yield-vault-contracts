# Copilot Instructions for sFDUSD Yield Vault Contracts

## Core Commands

### Build & Development
- `npm run build` - Compile Solidity contracts using Hardhat
- `npm run typechain` - Generate TypeScript bindings for contracts
- `npm run dev` - Start local Hardhat node
- `npm run clean` - Clean artifacts and cache

### Linting & Code Quality
- `npm run lint` - Run Solhint on all Solidity files in `src/`
- `npm run lint:fix` - Auto-fix Solhint issues
- `npm run size` - Check contract size with hardhat-contract-sizer
- `npm run flatten` - Flatten contracts for verification

### Testing (Not yet implemented)
- `npm test` - Run all tests with Mocha framework (future implementation)
- `npm run test:security` - Security-focused tests (future implementation)
- `npm run test:coverage` - Test coverage reports with solidity-coverage (future implementation)
- `npm run test:gas` - Gas usage analysis with hardhat-gas-reporter (future implementation)

## Project Architecture

### Core Technology Stack
- **Solidity 0.8.21** with optimizer enabled (200 runs, viaIR)
- **Hardhat** development environment with comprehensive plugin ecosystem
- **OpenZeppelin Contracts Upgradeable** for security patterns
- **TypeChain** for type-safe contract interactions
- **ERC-4626** standard for tokenized vaults

### Contract Structure
- **Primary Contract**: `ERC4626YieldVault.sol` - Main vault implementing ERC-4626 standard
- **Supporting Contracts**: 
  - `BaseToken.sol` - Test token with MINTER, UPGRADER, PAUSER roles
  - `TestContracts.sol` - Testing utilities
  - `MaliciousContracts.sol` - Security testing contracts
- **Architecture**: UUPS upgradeable proxy pattern with role-based access control

### Key Features
- ERC-4626 compliant tokenized vault with integrated share token
- Role-based access control (ADMIN, ORACLE, TREASURY, PAUSER, UPGRADER)
- Advanced security: reentrancy protection, MEV resistance, economic safeguards
- Dynamic NAV management with oracle-driven updates
- Emergency controls and batch operations

### Network Configuration
- **Development**: Hardhat local network (chainId: 1337)
- **BSC Testnet**: Configured for deployment (chainId: 97)
- **BSC Mainnet**: Configured for deployment (chainId: 56)

## Coding Standards

### Solidity Style Rules
- Follow official Solidity style guide
- Use NatSpec documentation for all public/external functions
- Apply security-first development practices
- Implement Checks-Effects-Interactions pattern

### Naming Conventions
- **Contracts**: PascalCase (`ERC4626YieldVault`)
- **Functions**: camelCase (`updateNAV`, `withdrawAssets`)
- **Variables**: camelCase (`currentNAV`, `withdrawalCooldown`)
- **Constants**: UPPER_SNAKE_CASE (`MAX_DEPOSIT_LIMIT`)
- **Events**: PascalCase (`AssetDeposited`, `NAVUpdated`)
- **Errors**: PascalCase with descriptive names (`InsufficientBalance`)

### Security Requirements
- All state-changing functions must use reentrancy guards
- Implement proper access control with role-based permissions
- Validate all inputs and handle edge cases
- Document security implications for critical functions
- Maintain economic attack resistance
- Use established OpenZeppelin security patterns

### File Organization
```
src/
├── contracts/
│   ├── ERC4626YieldVault.sol  # Main vault contract
│   ├── BaseToken.sol          # Test token implementation
│   └── TestContracts.sol      # Testing utilities
├── scripts/                   # Deployment scripts (empty)
└── tests/                     # Test suites (empty)
```

### Import Standards
- Group imports by source: OpenZeppelin first, then local contracts
- Use specific imports to minimize compilation overhead
- Prefer upgradeable versions of OpenZeppelin contracts

## Development Guidelines

### Security-First Approach
- Every change requires security impact assessment
- Use established patterns from OpenZeppelin
- Implement comprehensive input validation
- Consider economic attack vectors (flash loans, MEV, front-running)
- Maintain minimum 95% test coverage for production code

### Gas Optimization
- Enable optimizer with 200 runs for production deployment
- Use `viaIR` compilation for better optimization
- Consider gas costs in all implementations
- Test gas usage with hardhat-gas-reporter

### Access Control Patterns
- Use role-based access control for all privileged operations
- Implement multi-signature requirements for critical roles
- Follow principle of least privilege
- Document role responsibilities clearly

### Emergency Mechanisms
- Implement pause functionality for emergency stops
- Provide batch operations for crisis management
- Maintain proper upgrade mechanisms with security checks
- Document emergency response procedures

## Testing Philosophy

### Test Categories (To be implemented)
- **Unit Tests**: Individual function verification
- **Integration Tests**: Contract interaction testing
- **Security Tests**: Attack vector validation
- **Edge Case Tests**: Boundary condition handling
- **Gas Tests**: Optimization verification

### Security Testing Focus
- Reentrancy attack prevention
- Access control bypass attempts
- Economic manipulation resistance
- Front-running and MEV protection
- Emergency mechanism validation

## Deployment Considerations

### Pre-deployment Checklist
- Professional security audit required
- Comprehensive testnet testing
- Legal and regulatory compliance review
- Multi-signature wallet setup for admin roles
- Emergency response procedures documented

### Environment Variables
- `PRIVATE_KEY`: Deployment account private key
- `BSCSCAN_API_KEY`: For contract verification
- `COINMARKETCAP_API_KEY`: For gas reporting
- `REPORT_GAS`: Enable gas reporting
- `BASE_TOKEN_OWNER_KEY`: Base token deployment key (demo)
- `VAULT_ADMIN_KEY`: Vault administrator key (demo)
- `BLOCKCHAIN_ENTHUSIAST_KEY`: Test user key (demo)
- Additional role addresses for comprehensive testing (see `.env.example`)

## Common Tasks

### Adding New Features
1. Implement security-first design
2. Add comprehensive NatSpec documentation
3. Include proper access control
4. Implement input validation
5. Add corresponding tests
6. Update documentation

### Modifying Existing Functions
1. Assess security implications
2. Maintain backward compatibility where possible
3. Update tests to cover changes
4. Review gas impact
5. Update documentation

### Emergency Procedures
1. Use PAUSER_ROLE for immediate stops
2. Assess situation and communicate with stakeholders
3. Implement fixes with proper testing
4. Resume operations with appropriate controls

## Repository Context

- **Current Branch**: `tests` (development branch)
- **Default Branch**: `develop` (integration branch)
- **Repository**: 1stdigital/yield-vault-contracts
- **Package Name**: @1stdigital/sfdusd-contracts
- **License**: MIT

This is a smart contract repository focused on DeFi yield vault implementation with emphasis on security, upgradability, and ERC-4626 compliance.

## Development Environment

### Setup
- Copy `.env.example` to `.env` for local configuration
- Fund testnet accounts for BSC testnet demos
- Use provided role-based account structure for testing

### Configuration Files
- `hardhat.config.js` - Hardhat configuration with network settings
- `.env.example` - Template for environment variables with demo account structure
- `.gitignore` - Excludes build artifacts, environment files, IDE configs

### Mocha Testing Configuration
- Timeout: 40,000ms for complex contract interactions
- Test files located in `./test/` directory (when implemented)
- Coverage reports generated in `coverage/` directory
