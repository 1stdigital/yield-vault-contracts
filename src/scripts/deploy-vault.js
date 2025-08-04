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
    log.deploy("🚀 Starting Vault deployment...");

    const [deployer] = await ethers.getSigners();
    log.info("Deploying Vault with account:", deployer.address);
    log.info("Account balance:", (await deployer.provider.getBalance(deployer.address)).toString());

    // Configuration - Use environment variables or deployer as fallback
    const VAULT_DEFAULT_ADMIN = process.env.VAULT_DEFAULT_ADMIN || deployer.address;
    const TREASURY_ADDRESS = process.env.TREASURY_ADDRESS || deployer.address;
    const ORACLE_ADDRESS = process.env.ORACLE_ADDRESS || deployer.address;
    const PAUSER_ADDRESS = process.env.PAUSER_ADDRESS || deployer.address;
    const UPGRADER_ADDRESS = process.env.UPGRADER_ADDRESS || deployer.address;

    log.info("Vault Configuration:");
    log.info("- Default Admin:", VAULT_DEFAULT_ADMIN);
    log.info("- Treasury:", TREASURY_ADDRESS);
    log.info("- Oracle:", ORACLE_ADDRESS);
    log.info("- Pauser:", PAUSER_ADDRESS);
    log.info("- Upgrader:", UPGRADER_ADDRESS);

    // Get Base Token address from environment or deployment file
    let BASE_TOKEN_ADDRESS = process.env.BASE_TOKEN_ADDRESS;

    if (!BASE_TOKEN_ADDRESS) {
        log.info("BASE_TOKEN_ADDRESS not provided, checking deployment files...");
        const fs = require('fs');

        try {
            const baseTokenDeployment = JSON.parse(
                fs.readFileSync('deployments/base-token-latest.json', 'utf8')
            );
            BASE_TOKEN_ADDRESS = baseTokenDeployment.baseToken.address;
            log.info("✅ Found Base Token address from deployment file:", BASE_TOKEN_ADDRESS);
        } catch (error) {
            log.error("❌ Could not find Base Token address!");
            log.error("Please either:");
            log.error("1. Set BASE_TOKEN_ADDRESS environment variable");
            log.error("2. Deploy Base Token first using: npm run deploy:base-token");
            process.exit(1);
        }
    } else {
        log.info("✅ Using Base Token address from environment:", BASE_TOKEN_ADDRESS);
    }

    // Validate Base Token address
    if (!ethers.utils.isAddress(BASE_TOKEN_ADDRESS)) {
        log.error("❌ Invalid Base Token address:", BASE_TOKEN_ADDRESS);
        process.exit(1);
    }

    // Connect to existing Base Token
    const baseToken = await ethers.getContractAt("BaseToken", BASE_TOKEN_ADDRESS);

    try {
        const tokenName = await baseToken.name();
        const tokenSymbol = await baseToken.symbol();
        log.info("📄 Connected to Base Token:", `${tokenName} (${tokenSymbol})`);
    } catch (error) {
        log.error("❌ Failed to connect to Base Token at:", BASE_TOKEN_ADDRESS);
        log.error("Please verify the address is correct and the contract is deployed");
        process.exit(1);
    }

    // Contract names for new tokens (customizable via environment variables)
    const SHARE_TOKEN_NAME = process.env.VAULT_NAME || "sMST1 Vault";
    const SHARE_TOKEN_SYMBOL = process.env.VAULT_SYMBOL || "sMST1";

    log.info("\n📄 Deploying ERC4626 Yield Vault...");
    const YieldVault = await ethers.getContractFactory("ERC4626YieldVault");
    const vault = await upgrades.deployProxy(
        YieldVault,
        [
            BASE_TOKEN_ADDRESS,
            SHARE_TOKEN_NAME,
            SHARE_TOKEN_SYMBOL,
            TREASURY_ADDRESS,
            VAULT_DEFAULT_ADMIN
        ],
        { initializer: "initialize" }
    );
    await vault.deployed();
    log.success("✅ Yield Vault deployed to:", await vault.address);

    log.info("\n� Setting up additional role permissions...");

    // Grant additional roles if different from default admin
    if (ORACLE_ADDRESS !== VAULT_DEFAULT_ADMIN) {
        const ORACLE_ROLE = await vault.ORACLE_ROLE();
        await vault.grantRole(ORACLE_ROLE, ORACLE_ADDRESS);
        log.success("✅ Granted ORACLE_ROLE to:", ORACLE_ADDRESS);
    }

    if (TREASURY_ADDRESS !== VAULT_DEFAULT_ADMIN) {
        const TREASURY_ROLE = await vault.TREASURY_ROLE();
        await vault.grantRole(TREASURY_ROLE, TREASURY_ADDRESS);
        log.success("✅ Granted TREASURY_ROLE to:", TREASURY_ADDRESS);
    }

    if (PAUSER_ADDRESS !== VAULT_DEFAULT_ADMIN) {
        const PAUSER_ROLE = await vault.PAUSER_ROLE();
        await vault.grantRole(PAUSER_ROLE, PAUSER_ADDRESS);
        log.success("✅ Granted PAUSER_ROLE to:", PAUSER_ADDRESS);
    }

    if (UPGRADER_ADDRESS !== VAULT_DEFAULT_ADMIN) {
        const UPGRADER_ROLE = await vault.UPGRADER_ROLE();
        await vault.grantRole(UPGRADER_ROLE, UPGRADER_ADDRESS);
        log.success("✅ Granted UPGRADER_ROLE to:", UPGRADER_ADDRESS);
    }

    // Verify setup
    log.info("\n🔍 Verifying deployment...");
    const totalAssets = await vault.totalAssets();
    const vaultName = await vault.name();
    const vaultSymbol = await vault.symbol();

    log.info("- Vault Name:", vaultName);
    log.info("- Vault Symbol:", vaultSymbol);
    log.info("- Total Assets:", ethers.utils.formatEther(totalAssets));
    log.info("- Asset Token:", await vault.asset());

    if (!isTestMode) {
        console.log("\n📋 Vault Deployment Summary:");
        console.log("=".repeat(50));
        console.log(`Base Token:`, BASE_TOKEN_ADDRESS);
        console.log(`Vault (${SHARE_TOKEN_SYMBOL}):`, await vault.address);
        console.log("Default Admin:", VAULT_DEFAULT_ADMIN);
        console.log("Treasury Address:", TREASURY_ADDRESS);
        console.log("Oracle Address:", ORACLE_ADDRESS);
        console.log("Pauser Address:", PAUSER_ADDRESS);
        console.log("Upgrader Address:", UPGRADER_ADDRESS);
        console.log("=".repeat(50));
    }

    // Save deployment info
    const deploymentInfo = {
        network: (await ethers.provider.getNetwork()).name,
        chainId: (await ethers.provider.getNetwork()).chainId,
        deployer: deployer.address,
        timestamp: new Date().toISOString(),
        contracts: {
            baseToken: {
                address: BASE_TOKEN_ADDRESS,
                reused: true // Indicates this was an existing deployment
            },
            vault: {
                name: SHARE_TOKEN_NAME,
                symbol: SHARE_TOKEN_SYMBOL,
                address: await vault.address,
                isEIP4626: true
            }
        },
        config: {
            defaultAdmin: VAULT_DEFAULT_ADMIN,
            treasuryAddress: TREASURY_ADDRESS,
            oracleAddress: ORACLE_ADDRESS,
            pauserAddress: PAUSER_ADDRESS,
            upgraderAddress: UPGRADER_ADDRESS
        }
    };

    log.info("\n💾 Vault deployment info saved");
    const fs = require('fs');
    if (!fs.existsSync('deployments')) {
        fs.mkdirSync('deployments');
    }

    // Save both timestamped and latest versions
    if (!isTestMode) {
        fs.writeFileSync(
            `deployments/vault-${Date.now()}.json`,
            JSON.stringify(deploymentInfo, null, 2)
        );

        // Also save as latest for easy reference
        fs.writeFileSync(
            `deployments/vault-latest.json`,
            JSON.stringify(deploymentInfo, null, 2)
        );

        // Save complete deployment info combining both
        const completeDeployment = {
            ...deploymentInfo,
            contracts: {
                ...deploymentInfo.contracts,
                baseToken: {
                    ...deploymentInfo.contracts.baseToken,
                    name: await baseToken.name(),
                    symbol: await baseToken.symbol()
                }
            }
        };

        fs.writeFileSync(
            `deployments/deployment-latest.json`,
            JSON.stringify(completeDeployment, null, 2)
        );
    }

    log.deploy("🎉 Vault deployment completed successfully!");

    if (process.env.NODE_ENV !== 'test') {
        log.info("\n📝 Next steps:");
        log.info("1. Verify contracts on BSCScan");
        log.info("2. Set up multisig wallets for production");
        log.info("3. Transfer admin roles to multisig");
        log.info("4. Fund base token for testing");
        log.info("5. Test deposit/withdrawal flow");
    }

    return {
        baseToken,
        vault,
        deploymentInfo
    };
}

// Handle both script execution and module import
if (require.main === module) {
    main()
        .then(() => process.exit(0))
        .catch((error) => {
            log.error("❌ Vault deployment failed:", error);
            process.exit(1);
        });
}

module.exports = main;
