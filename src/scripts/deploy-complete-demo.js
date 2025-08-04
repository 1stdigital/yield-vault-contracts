const { ethers, upgrades } = require("hardhat");
const fs = require('fs');

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

// Account configuration
const ACCOUNTS = {
    // Accounts that need private keys (will sign transactions)
    baseTokenOwner: {
        privateKey: process.env.BASE_TOKEN_OWNER_KEY || "",
        name: "Base Token Owner",
        role: "Deploys and owns base token"
    },
    vaultAdmin: {
        privateKey: process.env.VAULT_ADMIN_KEY || "",
        name: "Vault Default Admin",
        role: "Main vault administrator"
    },
    blockchainEnthusiast: {
        privateKey: process.env.BLOCKCHAIN_ENTHUSIAST_KEY || "",
        name: "Blockchain Enthusiast",
        role: "Demo user for deposits/withdrawals"
    },
    // Accounts that only need addresses (just receive roles)
    treasuryRole: {
        address: process.env.TREASURY_ROLE_ADDRESS || "",
        name: "Treasury Role Account",
        role: "Treasury withdrawals (role only)"
    },
    oracleRole: {
        address: process.env.ORACLE_ROLE_ADDRESS || "",
        name: "Oracle Role Account",
        role: "NAV updates (role only)"
    },
    pauserUpgrader: {
        address: process.env.PAUSER_UPGRADER_ADDRESS || "",
        name: "Pauser/Upgrader Account",
        role: "Emergency controls (role only)"
    },
    randomGuy: {
        address: process.env.RANDOM_GUY_ADDRESS || "",
        name: "Random Guy",
        role: "No permissions (demo only)"
    }
};

async function main() {
    log.deploy("🚀 Starting Complete Demo Deployment for BSC Testnet");
    log.info("=".repeat(60));

    // Validate that we have all required private keys for signing accounts
    const signingAccounts = ['baseTokenOwner', 'vaultAdmin', 'blockchainEnthusiast'];
    const missingKeys = signingAccounts
        .filter(key => !ACCOUNTS[key].privateKey)
        .map(key => key);

    if (missingKeys.length > 0) {
        log.error("❌ Missing private keys for signing accounts:", missingKeys.join(", "));
        log.error("These accounts need private keys to sign transactions during deployment.");
        process.exit(1);
    }

    // Validate that we have all required addresses for role-only accounts
    const roleOnlyAccounts = ['treasuryRole', 'oracleRole', 'pauserUpgrader', 'randomGuy'];
    const missingAddresses = roleOnlyAccounts
        .filter(key => !ACCOUNTS[key].address)
        .map(key => key);

    if (missingAddresses.length > 0) {
        log.error("❌ Missing addresses for role-only accounts:", missingAddresses.join(", "));
        log.error("These accounts only need public addresses for role assignment.");
        process.exit(1);
    }

    // Create wallets for signing accounts
    const provider = ethers.provider;
    const wallets = {};
    const addresses = {};

    log.info("\n📊 Account Overview:");
    log.info("-".repeat(60));

    // Handle signing accounts (create wallets)
    for (const key of signingAccounts) {
        const account = ACCOUNTS[key];
        wallets[key] = new ethers.Wallet(account.privateKey, provider);
        addresses[key] = wallets[key].address;

        const balance = await provider.getBalance(wallets[key].address);

        log.info(`\n${account.name} (Signing Account):`);
        log.info(`  Address: ${wallets[key].address}`);
        log.info(`  Role: ${account.role}`);
        log.info(`  Balance: ${ethers.utils.formatEther(balance)} tBNB`);

        if (balance.eq(0)) {
            log.warn(`  ⚠️  WARNING: No tBNB balance! Get from faucet.`);
        }
    }

    // Handle role-only accounts (just addresses)
    for (const key of roleOnlyAccounts) {
        const account = ACCOUNTS[key];
        addresses[key] = account.address;

        log.info(`\n${account.name} (Role-Only Account):`);
        log.info(`  Address: ${account.address}`);
        log.info(`  Role: ${account.role}`);
        log.info(`  Note: No private key needed - role assignment only`);
    }

    log.info("\n" + "=".repeat(60));
    log.info("STEP 1: Deploy Base Token");
    log.info("=".repeat(60));

    // Get token names from environment variables
    const BASE_TOKEN_NAME = process.env.BASE_TOKEN_NAME || "MockStable Token";
    const BASE_TOKEN_SYMBOL = process.env.BASE_TOKEN_SYMBOL || (process.env.VAULT_SYMBOL ? process.env.VAULT_SYMBOL.replace('s', '') : "MST1");
    const VAULT_NAME = process.env.VAULT_NAME || "sMST1 Vault";
    const VAULT_SYMBOL = process.env.VAULT_SYMBOL || "sMST1";

    // Deploy Base Token with Base Token Owner account
    const BaseToken = await ethers.getContractFactory("BaseToken", wallets.baseTokenOwner);
    const baseToken = await upgrades.deployProxy(
        BaseToken,
        [BASE_TOKEN_NAME, BASE_TOKEN_SYMBOL, addresses.baseTokenOwner],
        { initializer: "initialize" }
    );
    await baseToken.deployed();
    log.success("✅ Base Token deployed to:", baseToken.address);

    log.info("\n" + "=".repeat(60));
    log.info("STEP 2: Deploy Vault");
    log.info("=".repeat(60));

    // Deploy Vault with Vault Admin account
    const YieldVault = await ethers.getContractFactory("ERC4626YieldVault", wallets.vaultAdmin);
    const vault = await upgrades.deployProxy(
        YieldVault,
        [
            baseToken.address,
            VAULT_NAME,
            VAULT_SYMBOL,
            addresses.treasuryRole, // Treasury address
            addresses.vaultAdmin    // Default admin
        ],
        { initializer: "initialize" }
    );
    await vault.deployed();
    log.success("✅ Vault deployed to:", vault.address);

    log.info("\n" + "=".repeat(60));
    log.info("STEP 3: Grant Vault Roles");
    log.info("=".repeat(60));

    // Connect to vault with admin account
    const vaultAdmin = vault.connect(wallets.vaultAdmin);

    // Grant roles
    const roles = [
        { role: await vault.ORACLE_ROLE(), account: addresses.oracleRole, name: "Oracle" },
        { role: await vault.TREASURY_ROLE(), account: addresses.treasuryRole, name: "Treasury" },
        { role: await vault.PAUSER_ROLE(), account: addresses.pauserUpgrader, name: "Pauser" },
        { role: await vault.UPGRADER_ROLE(), account: addresses.pauserUpgrader, name: "Upgrader" }
    ];

    for (const { role, account, name } of roles) {
        const tx = await vaultAdmin.grantRole(role, account);
        await tx.wait();
        log.success(`✅ Granted ${name} role to: ${account}`);
    }

    log.info("\n" + "=".repeat(60));
    log.info("STEP 4: Mint Demo Tokens");
    log.info("=".repeat(60));

    // Mint tokens to blockchain enthusiast
    const mintAmount = ethers.utils.parseEther("50000");
    const mintTx = await baseToken.connect(wallets.baseTokenOwner).mint(
        addresses.blockchainEnthusiast,
        mintAmount
    );
    await mintTx.wait();
    log.success(`✅ Minted 50,000 tokens to Blockchain Enthusiast`);

    // Also mint some to vault admin for initial deposit
    const adminMintTx = await baseToken.connect(wallets.baseTokenOwner).mint(
        addresses.vaultAdmin,
        ethers.utils.parseEther("10000")
    );
    await adminMintTx.wait();
    log.success(`✅ Minted 10,000 tokens to Vault Admin`);

    log.info("\n" + "=".repeat(60));
    log.info("STEP 5: Initial Vault Deposit");
    log.info("=".repeat(60));

    // Approve and deposit from vault admin
    const approveTx = await baseToken.connect(wallets.vaultAdmin).approve(
        vault.address,
        ethers.constants.MaxUint256
    );
    await approveTx.wait();

    const depositTx = await vault.connect(wallets.vaultAdmin).deposit(
        ethers.utils.parseEther("5000"),
        addresses.vaultAdmin
    );
    await depositTx.wait();
    log.success(`✅ Made initial deposit of 5,000 tokens`);

    // Get final stats
    const totalAssets = await vault.totalAssets();
    const currentNAV = await vault.currentNAV();
    const vaultShares = await vault.balanceOf(addresses.vaultAdmin);

    // Save deployment information
    const deploymentInfo = {
        network: "BSC Testnet",
        chainId: 97,
        timestamp: new Date().toISOString(),
        contracts: {
            baseToken: {
                address: baseToken.address,
                name: BASE_TOKEN_NAME,
                symbol: BASE_TOKEN_SYMBOL,
                owner: addresses.baseTokenOwner
            },
            vault: {
                address: vault.address,
                name: VAULT_NAME,
                symbol: VAULT_SYMBOL,
                admin: addresses.vaultAdmin,
                isEIP4626: true
            }
        },
        accounts: Object.entries(ACCOUNTS).reduce((acc, [key, account]) => {
            acc[key] = {
                address: addresses[key],
                name: account.name,
                role: account.role,
                hasPrivateKey: signingAccounts.includes(key)
            };
            return acc;
        }, {}),
        demoData: {
            blockchainEnthusiast: {
                baseTokenBalance: ethers.utils.formatEther(mintAmount),
                vaultShares: "0"
            },
            vaultAdmin: {
                baseTokenBalance: "5,000",
                vaultShares: ethers.utils.formatEther(vaultShares)
            },
            vault: {
                totalAssets: ethers.utils.formatEther(totalAssets),
                totalShares: ethers.utils.formatEther(vaultShares),
                currentNAV: ethers.utils.formatEther(currentNAV)
            }
        }
    };

    // Save deployment files
    if (!fs.existsSync('deployments')) {
        fs.mkdirSync('deployments');
    }

    // Save complete demo deployment
    fs.writeFileSync(
        'deployments/demo-deployment-latest.json',
        JSON.stringify(deploymentInfo, null, 2)
    );

    // Also save as standard deployment for compatibility
    fs.writeFileSync(
        'deployments/deployment-latest.json',
        JSON.stringify(deploymentInfo, null, 2)
    );

    if (!isTestMode) {
        console.log("\n" + "=".repeat(60));
        console.log("📋 DEPLOYMENT COMPLETE!");
        console.log("=".repeat(60));

        console.log("\n🔗 Contract Addresses for BscScan:");
        console.log(`Base Token: https://testnet.bscscan.com/address/${baseToken.address}`);
        console.log(`Vault: https://testnet.bscscan.com/address/${vault.address}`);

        console.log("\n👥 Account Summary:");
        Object.entries(wallets).forEach(([key, wallet]) => {
            console.log(`${ACCOUNTS[key].name}: ${wallet.address}`);
        });

        console.log("\n📊 Initial State:");
        console.log(`Total Assets: ${ethers.utils.formatEther(totalAssets)} ${BASE_TOKEN_SYMBOL}`);
        console.log(`Current NAV: ${ethers.utils.formatEther(currentNAV)}`);
        console.log(`Blockchain Enthusiast Balance: 50,000 ${BASE_TOKEN_SYMBOL}`);
        console.log(`Vault Admin Shares: ${ethers.utils.formatEther(vaultShares)} ${VAULT_SYMBOL}`);

        console.log("\n📝 Next Steps:");
        console.log("1. Verify contracts: npm run verify:testnet");
        console.log("2. Start your BscScan demo!");
        console.log("3. Each person switches MetaMask to their assigned account");
        console.log("4. Use 'Connect to Web3' on BscScan contract pages");

        console.log("\n🎯 Demo Functions to Try:");
        console.log("• Regular User (Blockchain Enthusiast): deposit(), withdraw()");
        console.log("• Oracle: updateNAV()");
        console.log("• Treasury: withdrawToTreasury()");
        console.log("• Random Guy: Try any admin function (should fail)");

        console.log("\n💾 Full deployment details saved to:");
        console.log("   deployments/demo-deployment-latest.json");
        console.log("   deployments/deployment-latest.json");

        console.log("\n✅ Ready for BSC Testnet Demo!");
    }

    return {
        baseToken,
        vault,
        wallets,
        deploymentInfo
    };
}

// Handle both script execution and module import
if (require.main === module) {
    main()
        .then(() => process.exit(0))
        .catch((error) => {
            log.error("❌ Complete demo deployment failed:", error);
            process.exit(1);
        });
}

module.exports = main;
