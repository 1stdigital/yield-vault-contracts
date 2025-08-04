const { ethers } = require("hardhat");
const fs = require("fs");

async function main() {
    console.log("🔍 Checking vault roles and permissions...\n");

    // Load deployment data
    const deploymentData = JSON.parse(fs.readFileSync("deployments/demo-deployment-latest.json", "utf8"));
    const vaultAddress = deploymentData.contracts.vault.address;

    // Get vault admin signer
    const vaultAdminKey = process.env.VAULT_ADMIN_KEY;
    const provider = ethers.provider;
    const admin = new ethers.Wallet(vaultAdminKey, provider);

    console.log(`👤 Admin Address: ${admin.address}`);
    console.log(`📋 Vault Address: ${vaultAddress}\n`);

    // Get the contract instance
    const vault = await ethers.getContractAt("ERC4626YieldVault", vaultAddress, admin);

    // Check roles
    try {
        const ADMIN_ROLE = await vault.ADMIN_ROLE();
        const DEFAULT_ADMIN_ROLE = await vault.DEFAULT_ADMIN_ROLE();

        console.log("🔑 Checking roles:");
        console.log(`   ADMIN_ROLE: ${ADMIN_ROLE}`);
        console.log(`   DEFAULT_ADMIN_ROLE: ${DEFAULT_ADMIN_ROLE}`);

        const hasAdminRole = await vault.hasRole(ADMIN_ROLE, admin.address);
        const hasDefaultAdminRole = await vault.hasRole(DEFAULT_ADMIN_ROLE, admin.address);

        console.log(`   Has ADMIN_ROLE: ${hasAdminRole}`);
        console.log(`   Has DEFAULT_ADMIN_ROLE: ${hasDefaultAdminRole}\n`);

        if (!hasAdminRole && !hasDefaultAdminRole) {
            console.log("❌ Admin account doesn't have required roles!");

            // Check who has admin roles
            console.log("🔍 Checking who has admin roles...");

            // This is a more complex check, but let's try to see what we can find
            try {
                const adminRoleMembers = await vault.getRoleMemberCount(ADMIN_ROLE);
                console.log(`   ADMIN_ROLE members count: ${adminRoleMembers}`);

                for (let i = 0; i < adminRoleMembers; i++) {
                    const member = await vault.getRoleMember(ADMIN_ROLE, i);
                    console.log(`   ADMIN_ROLE member ${i}: ${member}`);
                }
            } catch (error) {
                console.log(`   Could not enumerate admin role members: ${error.message}`);
            }

            return;
        }

        // Try a simple call first
        console.log("🧪 Testing simple function call...");
        try {
            // Try to call a simple view function first
            const vaultName = await vault.name();
            console.log(`✅ Current name: "${vaultName}"`);

            // Try with a different approach - just check basic view functions
            console.log("🧪 Trying basic view functions...");

            const currentSymbol = await vault.symbol();
            console.log(`✅ Current symbol: "${currentSymbol}"`);

            const totalAssets = await vault.totalAssets();
            console.log(`✅ Total assets: ${ethers.utils.formatEther(totalAssets)}`);

            console.log("✅ All basic functions work correctly!");

        } catch (error) {
            console.log(`❌ Function call failed: ${error.message}`);

            // Try to get more details about the revert
            if (error.data) {
                console.log(`   Error data: ${error.data}`);
            }

            // Check if this is a known error
            if (error.message.includes("execution reverted")) {
                console.log("   This appears to be a contract revert. Possible causes:");
                console.log("   - Function doesn't exist in deployed contract");
                console.log("   - Access control restriction");
                console.log("   - Contract is paused");
                console.log("   - Invalid parameter values");
            }
        }

    } catch (error) {
        console.log(`❌ Role check failed: ${error.message}`);
    }
}

if (require.main === module) {
    main()
        .then(() => process.exit(0))
        .catch((error) => {
            console.error("❌ Role check failed:", error);
            process.exit(1);
        });
}
