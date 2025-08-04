const { ethers, upgrades } = require("hardhat");

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
    log.deploy("🚀 Starting Base Token deployment...");

    const [deployer] = await ethers.getSigners();
    log.info("Deploying Base Token with account:", deployer.address);
    log.info("Account balance:", (await deployer.provider.getBalance(deployer.address)).toString());

    // Configuration - Use environment variables or deployer as fallback
    const BASE_TOKEN_ADMIN = process.env.BASE_TOKEN_ADMIN || deployer.address;

    // Contract names
    const BASE_TOKEN_NAME = "MockStable Token";
    const BASE_TOKEN_SYMBOL = "MST1";

    log.info("Base Token Admin Address:", BASE_TOKEN_ADMIN);

    log.info("\n📄 Deploying Base Token (MockStable)...");
    const BaseToken = await ethers.getContractFactory("BaseToken");
    const baseToken = await upgrades.deployProxy(
        BaseToken,
        [BASE_TOKEN_NAME, BASE_TOKEN_SYMBOL, BASE_TOKEN_ADMIN],
        { initializer: "initialize" }
    );
    await baseToken.deployed();
    log.success("✅ Base Token deployed to:", await baseToken.address);

    // Verify setup
    log.info("\n🔍 Verifying Base Token deployment...");
    const name = await baseToken.name();
    const symbol = await baseToken.symbol();
    const totalSupply = await baseToken.totalSupply();

    log.info("- Token Name:", name);
    log.info("- Token Symbol:", symbol);
    log.info("- Total Supply:", ethers.utils.formatEther(totalSupply));

    if (!isTestMode) {
        console.log("\n📋 Base Token Deployment Summary:");
        console.log("=".repeat(50));
        console.log(`Base Token (${BASE_TOKEN_SYMBOL}):`, await baseToken.address);
        console.log("Admin Address:", BASE_TOKEN_ADMIN);
        console.log("=".repeat(50));
    }

    // Save deployment info
    const deploymentInfo = {
        network: (await ethers.provider.getNetwork()).name,
        chainId: (await ethers.provider.getNetwork()).chainId,
        deployer: deployer.address,
        timestamp: new Date().toISOString(),
        baseToken: {
            name: BASE_TOKEN_NAME,
            symbol: BASE_TOKEN_SYMBOL,
            address: await baseToken.address,
            adminAddress: BASE_TOKEN_ADMIN
        }
    };

    log.info("\n💾 Base Token deployment info saved");
    const fs = require('fs');
    if (!fs.existsSync('deployments')) {
        fs.mkdirSync('deployments');
    }

    // Save both timestamped and latest versions
    if (!isTestMode) {
        fs.writeFileSync(
            `deployments/base-token-${Date.now()}.json`,
            JSON.stringify(deploymentInfo, null, 2)
        );

        // Also save as latest for easy reference
        fs.writeFileSync(
            `deployments/base-token-latest.json`,
            JSON.stringify(deploymentInfo, null, 2)
        );
    }

    log.deploy("🎉 Base Token deployment completed successfully!");

    if (process.env.NODE_ENV !== 'test') {
        log.info("\n📝 Next steps:");
        log.info("1. Verify Base Token contract on BSCScan");
        log.info("2. Use this address in vault deployment:");
        log.info(`   BASE_TOKEN_ADDRESS=${await baseToken.address}`);
        log.info("3. Run: npm run deploy:vault");
    }

    return {
        baseToken,
        deploymentInfo
    };
}

// Handle both script execution and module import
if (require.main === module) {
    main()
        .then(() => process.exit(0))
        .catch((error) => {
            log.error("❌ Base Token deployment failed:", error);
            process.exit(1);
        });
}

module.exports = main;
