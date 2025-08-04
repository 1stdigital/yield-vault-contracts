const { ethers } = require("hardhat");

// Determine if we're in test mode
const isTestMode = process.env.NODE_ENV === 'test' || process.env.HARDHAT_NETWORK === 'hardhat';

// Logging functions based on environment
const log = {
    info: (msg) => !isTestMode && console.log(msg),
    success: (msg) => !isTestMode && console.log(msg),
    warn: (msg) => console.warn(msg),
    error: (msg) => console.error(msg),
    deploy: (msg) => isTestMode ? console.log(`📦 ${msg}`) : console.log(msg)
};

async function main() {
    log.deploy("🚀 Starting role management setup...");

    const [deployer] = await ethers.getSigners();
    log.info("Managing roles with account:", deployer.address);

    // Load deployment info
    const fs = require('fs');
    let deploymentInfo;

    try {
        deploymentInfo = JSON.parse(
            fs.readFileSync('deployments/deployment-latest.json', 'utf8')
        );
    } catch (error) {
        log.error("❌ Could not find deployment file!");
        log.error("Please deploy contracts first.");
        process.exit(1);
    }

    // Connect to deployed contracts
    const baseToken = await ethers.getContractAt("BaseToken", deploymentInfo.contracts.baseToken.address);
    const vault = await ethers.getContractAt("ERC4626YieldVault", deploymentInfo.contracts.vault.address);

    log.info("📄 Connected to contracts:");
    log.info("- Base Token:", deploymentInfo.contracts.baseToken.address);
    log.info("- Vault:", deploymentInfo.contracts.vault.address);

    // Get role addresses from environment variables
    const BLOCKCHAIN_ENTHUSIAST = process.env.BLOCKCHAIN_ENTHUSIAST_ADDRESS;
    const VAULT_DEFAULT_ADMIN = process.env.VAULT_DEFAULT_ADMIN_ADDRESS;
    const TREASURY_ROLE_ACCOUNT = process.env.TREASURY_ROLE_ADDRESS;
    const ORACLE_ROLE_ACCOUNT = process.env.ORACLE_ROLE_ADDRESS;
    const PAUSER_UPGRADER_ACCOUNT = process.env.PAUSER_UPGRADER_ADDRESS;
    const RANDOM_GUY = process.env.RANDOM_GUY_ADDRESS;

    log.info("\n👥 Role Assignment Configuration:");
    log.info("- Blockchain Enthusiast:", BLOCKCHAIN_ENTHUSIAST || "Not provided");
    log.info("- Vault Default Admin:", VAULT_DEFAULT_ADMIN || "Not provided");
    log.info("- Treasury Role:", TREASURY_ROLE_ACCOUNT || "Not provided");
    log.info("- Oracle Role:", ORACLE_ROLE_ACCOUNT || "Not provided");
    log.info("- Pauser/Upgrader:", PAUSER_UPGRADER_ACCOUNT || "Not provided");
    log.info("- Random Guy:", RANDOM_GUY || "Not provided");

    // Get current role information
    log.info("\n🔍 Current Role Information:");

    // Base Token Roles
    const DEFAULT_ADMIN_ROLE = await baseToken.DEFAULT_ADMIN_ROLE();
    const baseTokenAdmin = await baseToken.hasRole(DEFAULT_ADMIN_ROLE, deployer.address);
    log.info("Base Token - Current deployer has admin role:", baseTokenAdmin);

    // Vault Roles
    const ADMIN_ROLE = await vault.ADMIN_ROLE();
    const ORACLE_ROLE = await vault.ORACLE_ROLE();
    const TREASURY_ROLE = await vault.TREASURY_ROLE();
    const PAUSER_ROLE = await vault.PAUSER_ROLE();
    const UPGRADER_ROLE = await vault.UPGRADER_ROLE();

    const hasAdminRole = await vault.hasRole(ADMIN_ROLE, deployer.address);
    log.info("Vault - Current deployer has admin role:", hasAdminRole);

    // Mint tokens to blockchain enthusiast if address provided
    if (BLOCKCHAIN_ENTHUSIAST && baseTokenAdmin) {
        log.info("\n💰 Minting tokens for Blockchain Enthusiast...");
        const mintAmount = ethers.utils.parseEther("10000");

        try {
            await baseToken.mint(BLOCKCHAIN_ENTHUSIAST, mintAmount);
            log.success("✅ Minted", ethers.utils.formatEther(mintAmount), "tokens to Blockchain Enthusiast");

            const balance = await baseToken.balanceOf(BLOCKCHAIN_ENTHUSIAST);
            log.info("📊 Blockchain Enthusiast balance:", ethers.utils.formatEther(balance));
        } catch (error) {
            log.error("❌ Failed to mint tokens:", error.message);
        }
    }

    // Grant vault roles if addresses provided and deployer has admin rights
    if (hasAdminRole) {
        log.info("\n🔑 Setting up vault roles...");

        if (VAULT_DEFAULT_ADMIN && VAULT_DEFAULT_ADMIN !== deployer.address) {
            try {
                await vault.grantRole(ADMIN_ROLE, VAULT_DEFAULT_ADMIN);
                log.success("✅ Granted ADMIN_ROLE to Vault Default Admin");
            } catch (error) {
                log.error("❌ Failed to grant ADMIN_ROLE:", error.message);
            }
        }

        if (TREASURY_ROLE_ACCOUNT) {
            try {
                await vault.grantRole(TREASURY_ROLE, TREASURY_ROLE_ACCOUNT);
                log.success("✅ Granted TREASURY_ROLE to Treasury Account");
            } catch (error) {
                log.error("❌ Failed to grant TREASURY_ROLE:", error.message);
            }
        }

        if (ORACLE_ROLE_ACCOUNT) {
            try {
                await vault.grantRole(ORACLE_ROLE, ORACLE_ROLE_ACCOUNT);
                log.success("✅ Granted ORACLE_ROLE to Oracle Account");
            } catch (error) {
                log.error("❌ Failed to grant ORACLE_ROLE:", error.message);
            }
        }

        if (PAUSER_UPGRADER_ACCOUNT) {
            try {
                await vault.grantRole(PAUSER_ROLE, PAUSER_UPGRADER_ACCOUNT);
                await vault.grantRole(UPGRADER_ROLE, PAUSER_UPGRADER_ACCOUNT);
                log.success("✅ Granted PAUSER_ROLE and UPGRADER_ROLE to Pauser/Upgrader Account");
            } catch (error) {
                log.error("❌ Failed to grant PAUSER/UPGRADER roles:", error.message);
            }
        }
    }

    // Generate demo script for each account
    if (!isTestMode) {
        console.log("\n📋 Demo Script for Each Account:");
        console.log("=".repeat(60));

        if (BLOCKCHAIN_ENTHUSIAST) {
            console.log("\n🔥 Blockchain Enthusiast Account Functions:");
            console.log(`Address: ${BLOCKCHAIN_ENTHUSIAST}`);
            console.log("✅ Can do:");
            console.log("- Check base token balance: balanceOf()");
            console.log("- Approve vault: approve(vault-address, amount)");
            console.log("- Deposit to vault: deposit(amount, receiver)");
            console.log("- Check vault shares: balanceOf() on vault");
            console.log("- Withdraw from vault: withdraw(assets, receiver, owner)");
            console.log("❌ Cannot do: Admin functions (will fail)");
        }

        if (TREASURY_ROLE_ACCOUNT) {
            console.log("\n💰 Treasury Role Account Functions:");
            console.log(`Address: ${TREASURY_ROLE_ACCOUNT}`);
            console.log("✅ Can do:");
            console.log("- withdrawToTreasury(amount) - Withdraw funds to treasury");
            console.log("❌ Cannot do: Oracle functions, Pausing, etc.");
        }

        if (ORACLE_ROLE_ACCOUNT) {
            console.log("\n🔮 Oracle Role Account Functions:");
            console.log(`Address: ${ORACLE_ROLE_ACCOUNT}`);
            console.log("✅ Can do:");
            console.log("- updateNAV(newNAV, newTotalAssets) - Update vault NAV");
            console.log("❌ Cannot do: Treasury functions, Pausing, etc.");
        }

        if (PAUSER_UPGRADER_ACCOUNT) {
            console.log("\n⏸️ Pauser/Upgrader Account Functions:");
            console.log(`Address: ${PAUSER_UPGRADER_ACCOUNT}`);
            console.log("✅ Can do:");
            console.log("- pause() - Pause the vault");
            console.log("- Upgrade functions (complex, requires new implementation)");
            console.log("❌ Cannot do: Treasury functions, Oracle functions");
        }

        if (RANDOM_GUY) {
            console.log("\n🤷 Random Guy Account Functions:");
            console.log(`Address: ${RANDOM_GUY}`);
            console.log("✅ Can do:");
            console.log("- Read functions only (totalAssets, balanceOf, etc.)");
            console.log("❌ Cannot do: Any admin functions (perfect for showing access control)");
        }

        console.log("\n🎯 Demo Flow Suggestions:");
        console.log("1. Show Blockchain Enthusiast can deposit/withdraw");
        console.log("2. Show Treasury can withdraw to treasury");
        console.log("3. Show Oracle can update NAV");
        console.log("4. Show Pauser can pause contract");
        console.log("5. Show Random Guy gets 'AccessControl: account missing role' errors");
        console.log("6. Show how pausing affects all operations");
        console.log("=".repeat(60));
    }

    // Save role information
    const roleInfo = {
        baseToken: deploymentInfo.contracts.baseToken.address,
        vault: deploymentInfo.contracts.vault.address,
        roles: {
            blockchainEnthusiast: BLOCKCHAIN_ENTHUSIAST,
            vaultDefaultAdmin: VAULT_DEFAULT_ADMIN,
            treasuryRole: TREASURY_ROLE_ACCOUNT,
            oracleRole: ORACLE_ROLE_ACCOUNT,
            pauserUpgrader: PAUSER_UPGRADER_ACCOUNT,
            randomGuy: RANDOM_GUY
        },
        roleHashes: {
            DEFAULT_ADMIN_ROLE: DEFAULT_ADMIN_ROLE,
            ADMIN_ROLE: ADMIN_ROLE,
            ORACLE_ROLE: ORACLE_ROLE,
            TREASURY_ROLE: TREASURY_ROLE,
            PAUSER_ROLE: PAUSER_ROLE,
            UPGRADER_ROLE: UPGRADER_ROLE
        },
        timestamp: new Date().toISOString()
    };

    if (!isTestMode) {
        if (!fs.existsSync('deployments')) {
            fs.mkdirSync('deployments');
        }

        fs.writeFileSync(
            'deployments/roles-latest.json',
            JSON.stringify(roleInfo, null, 2)
        );
    }

    log.deploy("🎉 Role management setup completed!");

    return roleInfo;
}

// Handle both script execution and module import
if (require.main === module) {
    main()
        .then(() => process.exit(0))
        .catch((error) => {
            log.error("❌ Role management failed:", error);
            process.exit(1);
        });
}

module.exports = main;
