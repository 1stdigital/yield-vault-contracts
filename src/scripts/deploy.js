const { ethers, upgrades } = require("hardhat");

// Import the modular deployment scripts
const deployBaseToken = require("./deploy-base-token");
const deployVault = require("./deploy-vault");

// Determine if we're in test mode
const isTestMode = process.env.NODE_ENV === 'test' || process.env.HARDHAT_NETWORK === 'hardhat';

// Logging functions based on environment
const log = {
    info: (msg) => !isTestMode && console.log(msg),
    success: (msg) => !isTestMode && console.log(msg),
    warn: (msg) => console.warn(msg), // Always show warnings
    error: (msg) => console.error(msg), // Always show errors
    test: (msg) => isTestMode && console.log(msg), // Only in test mode
    deploy: (msg) => isTestMode ? console.log(`📦 ${msg}`) : console.log(msg) // Compact for tests
};

async function main() {
    log.deploy("🚀 Starting complete deployment (Base Token + Vault)...");

    const [deployer] = await ethers.getSigners();
    log.info("Deploying contracts with account:", deployer.address);
    log.info("Account balance:", (await deployer.provider.getBalance(deployer.address)).toString());

    // Step 1: Deploy Base Token
    log.info("\n" + "=".repeat(50));
    log.info("STEP 1: Deploying Base Token");
    log.info("=".repeat(50));

    const baseTokenResult = await deployBaseToken();
    const baseTokenAddress = await baseTokenResult.baseToken.address;

    log.success("✅ Base Token deployment completed");

    // Step 2: Deploy Vault (it will automatically use the base token we just deployed)
    log.info("\n" + "=".repeat(50));
    log.info("STEP 2: Deploying Vault");
    log.info("=".repeat(50));

    // Set the base token address for vault deployment
    process.env.BASE_TOKEN_ADDRESS = baseTokenAddress;

    const vaultResult = await deployVault();

    log.success("✅ Vault deployment completed");

    // Final summary
    if (!isTestMode) {
        console.log("\n📋 Complete Deployment Summary:");
        console.log("=".repeat(50));
        console.log(`Base Token:`, baseTokenAddress);
        console.log("Yield Vault:", await vaultResult.vault.address);
        console.log("Admin Address:", vaultResult.deploymentInfo.config.defaultAdmin);
        console.log("Treasury Address:", vaultResult.deploymentInfo.config.treasuryAddress);
        console.log("=".repeat(50));

        log.info("\n📝 Next steps:");
        log.info("1. Verify contracts: npm run verify:testnet");
        log.info("2. Setup demo data: npm run setup:demo:testnet");
        log.info("3. Fund base token for testing");
        log.info("4. Test deposit/withdrawal flow on BSCScan");
    }

    return {
        baseToken: baseTokenResult.baseToken,
        vault: vaultResult.vault,
        deploymentInfo: vaultResult.deploymentInfo
    };
}

// Handle both script execution and module import
if (require.main === module) {
    main()
        .then(() => process.exit(0)).catch((error) => {
            log.error("❌ Deployment failed:", error);
            process.exit(1);
        });
}

module.exports = main;
