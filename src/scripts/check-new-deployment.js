const hre = require("hardhat");
const fs = require("fs");

async function main() {
    console.log("🔍 Checking new deployment contract values...");

    const deployment = JSON.parse(fs.readFileSync('./deployments/deployment-latest.json', 'utf8'));

    console.log("📍 Contract Addresses:");
    console.log("Base Token:", deployment.contracts.baseToken.address);
    console.log("Vault:", deployment.contracts.vault.address);

    // Check base token
    const BaseToken = await hre.ethers.getContractFactory("BaseToken");
    const baseToken = BaseToken.attach(deployment.contracts.baseToken.address);

    const baseTokenName = await baseToken.name();
    const baseTokenSymbol = await baseToken.symbol();

    console.log("\n📝 Base Token Values:");
    console.log("Name:", baseTokenName);
    console.log("Symbol:", baseTokenSymbol);
    console.log("Expected: MockStable Token 3 / MST3");

    // Check vault
    const Vault = await hre.ethers.getContractFactory("ERC4626YieldVault");
    const vault = Vault.attach(deployment.contracts.vault.address);

    const vaultName = await vault.name();
    const vaultSymbol = await vault.symbol();

    console.log("\n📝 Vault Values:");
    console.log("Name:", vaultName);
    console.log("Symbol:", vaultSymbol);
    console.log("Expected: sMST3 Vault / sMST3");

    // Verify they match environment variables
    const expectedBaseName = process.env.BASE_TOKEN_NAME || "MockStable Token 3";
    const expectedBaseSymbol = process.env.BASE_TOKEN_SYMBOL || "MST3";
    const expectedVaultName = process.env.VAULT_NAME || "sMST3 Vault";
    const expectedVaultSymbol = process.env.VAULT_SYMBOL || "sMST3";

    console.log("\n✅ Verification Results:");
    console.log("Base Token Name:", baseTokenName === expectedBaseName ? "✅ CORRECT" : "❌ WRONG");
    console.log("Base Token Symbol:", baseTokenSymbol === expectedBaseSymbol ? "✅ CORRECT" : "❌ WRONG");
    console.log("Vault Name:", vaultName === expectedVaultName ? "✅ CORRECT" : "❌ WRONG");
    console.log("Vault Symbol:", vaultSymbol === expectedVaultSymbol ? "✅ CORRECT" : "❌ WRONG");

    console.log("\n🌐 BSCScan Links:");
    console.log("Base Token:", `https://testnet.bscscan.com/address/${deployment.contracts.baseToken.address}`);
    console.log("Vault:", `https://testnet.bscscan.com/address/${deployment.contracts.vault.address}`);
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
