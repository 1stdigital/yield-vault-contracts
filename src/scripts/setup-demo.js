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
    log.deploy("🚀 Starting demo setup...");

    const [deployer] = await ethers.getSigners();
    log.info("Setting up demo with account:", deployer.address);

    // Load deployment info
    const fs = require('fs');
    let deploymentInfo;

    try {
        deploymentInfo = JSON.parse(
            fs.readFileSync('deployments/deployment-latest.json', 'utf8')
        );
    } catch (error) {
        log.error("❌ Could not find deployment file!");
        log.error("Please deploy contracts first using:");
        log.error("1. npm run deploy:base-token");
        log.error("2. npm run deploy:vault");
        process.exit(1);
    }

    // Connect to deployed contracts
    const baseToken = await ethers.getContractAt("BaseToken", deploymentInfo.contracts.baseToken.address);
    const vault = await ethers.getContractAt("ERC4626YieldVault", deploymentInfo.contracts.vault.address);

    log.info("📄 Connected to contracts:");
    log.info("- Base Token:", deploymentInfo.contracts.baseToken.address);
    log.info("- Vault (EIP-4626):", deploymentInfo.contracts.vault.address);

    // Demo setup parameters
    const DEMO_MINT_AMOUNT = ethers.utils.parseEther("50000"); // 50k tokens for demo
    const INITIAL_DEPOSIT = ethers.utils.parseEther("5000"); // 5k initial deposit

    // Get target user address for minting (use env var or deployer)
    const TARGET_USER = process.env.DEMO_USER_ADDRESS || deployer.address;

    log.info("Demo Setup Configuration:");
    log.info("- Mint Amount:", ethers.utils.formatEther(DEMO_MINT_AMOUNT));
    log.info("- Initial Deposit:", ethers.utils.formatEther(INITIAL_DEPOSIT));
    log.info("- Target User:", TARGET_USER);

    log.info("\n💰 Minting demo tokens...");

    // Check if deployer has admin role
    const DEFAULT_ADMIN_ROLE = await baseToken.DEFAULT_ADMIN_ROLE();
    const hasAdminRole = await baseToken.hasRole(DEFAULT_ADMIN_ROLE, deployer.address);

    if (!hasAdminRole) {
        log.error("❌ Deployer does not have admin role on base token!");
        log.error("Cannot mint tokens for demo setup.");
        process.exit(1);
    }

    // Mint tokens for demo
    await baseToken.mint(TARGET_USER, DEMO_MINT_AMOUNT);
    log.success("✅ Minted", ethers.utils.formatEther(DEMO_MINT_AMOUNT), "demo tokens to", TARGET_USER);

    // Check current balance
    const balance = await baseToken.balanceOf(TARGET_USER);
    log.info("📊 Target user token balance:", ethers.utils.formatEther(balance));

    log.info("\n🔓 Approving vault to spend tokens...");

    // Approve vault to spend tokens (use a reasonable amount, not max)
    const approvalAmount = ethers.utils.parseEther("20000"); // 20k approval
    await baseToken.approve(vault.address, approvalAmount);
    log.success("✅ Approved vault to spend", ethers.utils.formatEther(approvalAmount), "tokens");

    log.info("\n💼 Making initial deposit...");

    // Make initial deposit to demonstrate vault functionality
    await vault.deposit(INITIAL_DEPOSIT, deployer.address);
    log.success("✅ Made initial deposit of", ethers.utils.formatEther(INITIAL_DEPOSIT), "tokens");

    // Show vault stats after deposit
    const totalAssets = await vault.totalAssets();
    const shareBalance = await vault.balanceOf(deployer.address);
    const vaultName = await vault.name();
    const currentNAV = await vault.currentNAV();

    log.info("\n📈 Post-deposit vault stats:");
    log.info("- Vault Name:", vaultName);
    log.info("- Total Assets:", ethers.utils.formatEther(totalAssets));
    log.info("- Current NAV:", ethers.utils.formatEther(currentNAV));
    log.info("- Your Share Tokens:", ethers.utils.formatEther(shareBalance));

    // Calculate some demo values for BscScan interaction
    const previewDeposit = await vault.previewDeposit(ethers.utils.parseEther("1000"));
    const previewWithdraw = await vault.previewWithdraw(ethers.utils.parseEther("1000"));

    if (!isTestMode) {
        console.log("\n📋 Demo Setup Complete!");
        console.log("=".repeat(50));
        console.log("🌐 BSC Testnet Addresses:");
        console.log(`Base Token: ${deploymentInfo.contracts.baseToken.address}`);
        console.log(`Vault (EIP-4626): ${deploymentInfo.contracts.vault.address}`);
        console.log("\n💡 Demo Values for BscScan:");
        console.log(`- Target user has ${ethers.utils.formatEther(balance)} base tokens`);
        console.log(`- Depositing 1000 tokens would give ${ethers.utils.formatEther(previewDeposit)} shares`);
        console.log(`- Withdrawing 1000 tokens would cost ${ethers.utils.formatEther(previewWithdraw)} shares`);
        console.log("\n🎯 BscScan Demo Functions to Try:");
        console.log("Read Functions:");
        console.log("- totalAssets() - Show total vault assets");
        console.log("- currentNAV() - Show current NAV");
        console.log("- previewDeposit(1000000000000000000000) - Preview 1000 token deposit");
        console.log("- balanceOf(your-address) - Check your share balance");
        console.log("- canWithdraw(your-address) - Check if withdrawal is allowed");
        console.log("\nWrite Functions (EIP-4626 Standard):");
        console.log("- deposit(1000000000000000000000, your-address) - Deposit 1000 tokens");
        console.log("- withdraw(500000000000000000000, your-address, your-address) - Withdraw 500 tokens");
        console.log("- mint(shares-amount, your-address) - Mint specific share amount");
        console.log("- redeem(shares-amount, your-address, your-address) - Redeem shares");
        console.log("\nAdmin Functions (for role demo):");
        console.log("- updateNAV(newNAV, newTotalAssets) - Update NAV (ORACLE_ROLE)");
        console.log("- withdrawToTreasury(amount) - Withdraw to treasury (TREASURY_ROLE)");
        console.log("- pause() - Pause contract (PAUSER_ROLE)");
        console.log("=".repeat(50));
    }

    return {
        baseToken,
        vault,
        demoData: {
            targetUserBalance: balance,
            shareBalance: shareBalance,
            totalAssets: totalAssets,
            currentNAV: currentNAV,
            previewDeposit: previewDeposit,
            previewWithdraw: previewWithdraw
        }
    };
}

// Handle both script execution and module import
if (require.main === module) {
    main()
        .then(() => process.exit(0))
        .catch((error) => {
            log.error("❌ Demo setup failed:", error);
            process.exit(1);
        });
}

module.exports = main;
