const hre = require("hardhat");

async function main() {
    console.log("Verifying contracts on network:", hre.network.name);

    // Get deployed contract addresses from environment or deployment file
    const BASE_TOKEN_ADDRESS = process.env.BASE_TOKEN_ADDRESS;
    const VAULT_ADDRESS = process.env.VAULT_ADDRESS;

    if (!BASE_TOKEN_ADDRESS || !VAULT_ADDRESS) {
        console.error("Please set environment variables for contract addresses:");
        console.error("BASE_TOKEN_ADDRESS, VAULT_ADDRESS");
        return;
    }

    try {
        // Verify BaseToken
        console.log("Verifying BaseToken...");
        await hre.run("verify:verify", {
            address: BASE_TOKEN_ADDRESS,
            constructorArguments: [],
            contract: "src/contracts/BaseToken.sol:BaseToken"
        });
        console.log("BaseToken verified!");

        // Verify ERC4626YieldVault
        console.log("Verifying ERC4626YieldVault...");
        await hre.run("verify:verify", {
            address: VAULT_ADDRESS,
            constructorArguments: [],
            contract: "src/contracts/ERC4626YieldVault.sol:ERC4626YieldVault"
        });
        console.log("ERC4626YieldVault verified!");

    } catch (error) {
        console.error("Verification failed:", error);
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
