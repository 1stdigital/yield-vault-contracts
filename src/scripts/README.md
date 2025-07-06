# Deployment Scripts

This folder contains comprehensive deployment and management scripts for the sFDUSD Yield Vault contracts.

## Quick Start

### Local Development
```bash
# Start local Hardhat node
npm run dev

# Deploy complete setup locally
npm run deploy:complete
```

### BSC Testnet Deployment
```bash
# Deploy complete demo setup (recommended for testing)
npm run deploy:demo:testnet

# OR deploy step by step:
npm run deploy:base-token:testnet
npm run deploy:vault:testnet
```

## Scripts Overview

### Deployment Scripts

#### 1. `deploy-base-token.js`
- Deploys the BaseToken (MockStable) contract
- Creates an upgradeable proxy
- **Usage**: `npm run deploy:base-token[:testnet]`
- **Environment Variables**:
  - `BASE_TOKEN_ADMIN` - Admin address (defaults to deployer)
  - `BASE_TOKEN_NAME` - Token name (default: "MockStable Token")
  - `BASE_TOKEN_SYMBOL` - Token symbol (default: "MST1")

#### 2. `deploy-vault.js`
- Deploys the ERC4626YieldVault contract
- Requires existing BaseToken deployment
- **Usage**: `npm run deploy:vault[:testnet]`
- **Environment Variables**:
  - `BASE_TOKEN_ADDRESS` - Required if not found in deployment files
  - `VAULT_DEFAULT_ADMIN` - Vault admin (defaults to deployer)
  - `TREASURY_ADDRESS` - Treasury address (defaults to deployer)
  - `ORACLE_ADDRESS` - Oracle address (defaults to deployer)
  - `PAUSER_ADDRESS` - Pauser address (defaults to deployer)
  - `UPGRADER_ADDRESS` - Upgrader address (defaults to deployer)
  - `VAULT_NAME` - Vault name (default: "sMST1 Vault")
  - `VAULT_SYMBOL` - Vault symbol (default: "sMST1")

#### 3. `deploy.js`
- Orchestrates complete deployment (BaseToken + Vault)
- **Usage**: `npm run deploy:complete[:testnet]`
- Uses same environment variables as individual scripts

#### 4. `deploy-complete-demo.js`
- **RECOMMENDED FOR DEMOS**: Full demo setup with multiple accounts
- Deploys contracts, assigns roles, mints demo tokens, makes initial deposits
- **Usage**: `npm run deploy:demo[:testnet]`
- **Required Environment Variables** (all need private keys for signing accounts):
  - `BASE_TOKEN_OWNER_KEY` - Private key for base token owner
  - `VAULT_ADMIN_KEY` - Private key for vault admin
  - `BLOCKCHAIN_ENTHUSIAST_KEY` - Private key for demo user
  - `TREASURY_ROLE_ADDRESS` - Address for treasury role
  - `ORACLE_ROLE_ADDRESS` - Address for oracle role
  - `PAUSER_UPGRADER_ADDRESS` - Address for pauser/upgrader roles
  - `RANDOM_GUY_ADDRESS` - Address with no permissions (for demo)

### Setup Scripts

#### 5. `setup-demo.js`
- Sets up demo data for existing deployment
- Mints tokens, approves vault, makes initial deposit
- **Usage**: `npm run setup:demo[:testnet]`
- **Environment Variables**:
  - `DEMO_USER_ADDRESS` - Target user for token minting (defaults to deployer)

#### 6. `setup-roles.js`
- Manages role assignments for existing deployment
- **Usage**: `npm run setup:roles[:testnet]`
- **Environment Variables**: Same as deploy-complete-demo.js

### Verification Scripts

#### 7. `verify-contracts.js`
- **RECOMMENDED**: Comprehensive contract verification
- Automatically detects deployed contracts from deployment files
- **Usage**: `npm run verify:contracts[:testnet]`

#### 8. `verify.js`
- Simple verification script requiring manual addresses
- **Usage**: Set `BASE_TOKEN_ADDRESS` and `VAULT_ADDRESS` env vars, then run script

### Inspection Scripts

#### 9. `check-new-deployment.js`
- Verifies contract values match expected configuration
- **Usage**: `npm run check:deployment[:testnet]`

#### 10. `check-vault-roles.js`
- Checks vault roles and permissions for specific account
- **Usage**: `npm run check:roles[:testnet]`
- **Environment Variables**:
  - `VAULT_ADMIN_KEY` - Private key for vault admin account

## Deployment Flows

### Development Flow
```bash
# 1. Start local node
npm run dev

# 2. Deploy contracts
npm run deploy:complete

# 3. Setup demo data
npm run setup:demo
```

### Production/Testnet Flow
```bash
# 1. Set environment variables in .env file

# 2. Deploy to testnet
npm run deploy:vault:testnet

# 3. Verify contracts
npm run verify:contracts:testnet

# 4. Setup roles (if needed)
npm run setup:roles:testnet
```

### Demo Flow (Recommended for BSC Testnet)
```bash
# 1. Set all demo environment variables in .env file

# 2. One-command complete demo setup
npm run deploy:demo:testnet

# 3. Verify contracts
npm run verify:contracts:testnet

# 4. Check deployment
npm run check:deployment:testnet
```

## Environment Variables Reference

Create a `.env` file with the required variables:

```bash
# Required for demo deployment
BASE_TOKEN_OWNER_KEY=0x...
VAULT_ADMIN_KEY=0x...
BLOCKCHAIN_ENTHUSIAST_KEY=0x...
TREASURY_ROLE_ADDRESS=0x...
ORACLE_ROLE_ADDRESS=0x...
PAUSER_UPGRADER_ADDRESS=0x...
RANDOM_GUY_ADDRESS=0x...

# Optional customization
BASE_TOKEN_NAME="Custom Token Name"
BASE_TOKEN_SYMBOL="CTN"
VAULT_NAME="Custom Vault Name"
VAULT_SYMBOL="CVN"

# For manual deployments
VAULT_DEFAULT_ADMIN=0x...
TREASURY_ADDRESS=0x...
ORACLE_ADDRESS=0x...
PAUSER_ADDRESS=0x...
UPGRADER_ADDRESS=0x...
```

## Output Files

All scripts save deployment information to the `deployments/` folder:

- `base-token-latest.json` - Base token deployment info
- `vault-latest.json` - Vault deployment info
- `deployment-latest.json` - Complete deployment info
- `demo-deployment-latest.json` - Demo deployment with account info
- `roles-latest.json` - Role assignment info

## Network Configuration

Scripts automatically detect the network and adjust behavior:
- **Local Hardhat**: Test mode with compact logging
- **BSC Testnet**: Full logging and BSCScan links
- **BSC Mainnet**: Production deployment ready

## Troubleshooting

### Common Issues

1. **"Could not find deployment file"**
   - Deploy contracts first using deployment scripts
   - Check that deployment files exist in `deployments/` folder

2. **"Missing private keys for signing accounts"**
   - Set required private keys in `.env` file
   - Use different deployment script (e.g., `deploy:vault` instead of `deploy:demo`)

3. **"Contract verification failed"**
   - Wait a few minutes after deployment
   - Check that contract addresses are correct
   - Ensure you're on the right network

4. **"AccessControl: account missing role"**
   - Check role assignments with `npm run check:roles:testnet`
   - Use `npm run setup:roles:testnet` to assign roles

### Getting Help

1. Check deployment files in `deployments/` folder
2. Use inspection scripts to verify current state
3. Check environment variables are correctly set
4. Ensure sufficient gas/tokens on deployment account
