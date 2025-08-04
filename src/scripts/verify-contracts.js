const hre = require("hardhat");

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

async function verifyContract(address, constructorArguments = [], contractPath = null) {
    try {
        log.info(`🔍 Verifying contract at ${address}...`);

        const verifyParams = {
            address: address,
            constructorArguments: constructorArguments,
        };

        if (contractPath) {
            verifyParams.contract = contractPath;
        }

        await hre.run("verify:verify", verifyParams);
        log.success(`✅ Contract verified successfully: ${address}`);
        return true;
    } catch (error) {
        if (error.message.toLowerCase().includes("already verified")) {
            log.warn(`⚠️  Contract already verified: ${address}`);
            return true;
        } else {
            log.error(`❌ Verification failed for ${address}:`, error.message);
            return false;
        }
    }
}

async function main() {
    log.deploy("🚀 Starting contract verification...");

    const fs = require('fs');
    let deploymentInfo;

    // Check which deployment files exist
    const baseTokenExists = fs.existsSync('deployments/base-token-latest.json');
    const vaultExists = fs.existsSync('deployments/vault-latest.json');
    const completeExists = fs.existsSync('deployments/deployment-latest.json');

    if (completeExists) {
        // Use complete deployment file
        deploymentInfo = JSON.parse(fs.readFileSync('deployments/deployment-latest.json', 'utf8'));
        log.info("📄 Using complete deployment file");
    } else if (baseTokenExists && vaultExists) {
        // Merge separate deployment files
        const baseTokenInfo = JSON.parse(fs.readFileSync('deployments/base-token-latest.json', 'utf8'));
        const vaultInfo = JSON.parse(fs.readFileSync('deployments/vault-latest.json', 'utf8'));

        deploymentInfo = {
            ...vaultInfo,
            contracts: {
                baseToken: baseTokenInfo.baseToken,
                ...vaultInfo.contracts
            }
        };
        log.info("📄 Merged base token and vault deployment files");
    } else if (baseTokenExists) {
        // Only base token
        const baseTokenInfo = JSON.parse(fs.readFileSync('deployments/base-token-latest.json', 'utf8'));
        deploymentInfo = {
            contracts: {
                baseToken: baseTokenInfo.baseToken
            }
        };
        log.info("📄 Using base token deployment file only");
    } else {
        log.error("❌ No deployment files found!");
        log.error("Please deploy contracts first.");
        process.exit(1);
    }

    const results = [];

    // Verify Base Token (if exists)
    if (deploymentInfo.contracts?.baseToken?.address) {
        log.info("\n📄 Verifying Base Token...");
        const result = await verifyContract(
            deploymentInfo.contracts.baseToken.address,
            [], // Proxy contracts don't need constructor args for verification
            "src/contracts/BaseToken.sol:BaseToken"
        );
        results.push({ contract: "Base Token", success: result });
    }

    // Verify Vault (if exists)
    if (deploymentInfo.contracts?.vault?.address) {
        log.info("\n📄 Verifying ERC4626 Yield Vault...");
        const result = await verifyContract(
            deploymentInfo.contracts.vault.address,
            [], // Proxy contracts don't need constructor args for verification
            "src/contracts/ERC4626YieldVault.sol:ERC4626YieldVault"
        );
        results.push({ contract: "ERC4626 Yield Vault", success: result });
    }

    // Summary
    log.info("\n📋 Verification Summary:");
    log.info("=".repeat(50));

    let allSuccess = true;
    results.forEach(result => {
        const status = result.success ? "✅ VERIFIED" : "❌ FAILED";
        log.info(`${result.contract}: ${status}`);
        if (!result.success) allSuccess = false;
    });

    log.info("=".repeat(50));

    if (allSuccess) {
        log.success("🎉 All contracts verified successfully!");

        if (!isTestMode) {
            log.info("\n🌐 View your contracts on BSCScan:");
            if (deploymentInfo.contracts?.baseToken?.address) {
                log.info(`Base Token: https://testnet.bscscan.com/address/${deploymentInfo.contracts.baseToken.address}`);
            }
            if (deploymentInfo.contracts?.vault?.address) {
                log.info(`ERC4626 Yield Vault: https://testnet.bscscan.com/address/${deploymentInfo.contracts.vault.address}`);
            }
        }
    } else {
        log.error("❌ Some verifications failed. Check the errors above.");
        process.exit(1);
    }

    return results;
}

// Handle both script execution and module import
if (require.main === module) {
    main()
        .then(() => process.exit(0))
        .catch((error) => {
            log.error("❌ Verification failed:", error);
            process.exit(1);
        });
}

module.exports = main;
