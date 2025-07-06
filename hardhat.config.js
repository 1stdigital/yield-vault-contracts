require("@nomicfoundation/hardhat-ethers");
require("@nomicfoundation/hardhat-chai-matchers");
require("@nomicfoundation/hardhat-verify");
require("@openzeppelin/hardhat-upgrades");
require("@typechain/hardhat");
require("hardhat-contract-sizer");
require("hardhat-gas-reporter");
require("solidity-coverage");
require("dotenv").config();

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
    solidity: {
        version: "0.8.21",
        settings: {
            optimizer: {
                enabled: true,
                runs: 200,
            },
            viaIR: true,
        },
    },
    networks: {
        hardhat: {
            chainId: 1337,
            allowUnlimitedContractSize: true,
        },
        localhost: {
            url: "http://127.0.0.1:8545",
            chainId: 1337,
            allowUnlimitedContractSize: true,
        },
        "bsc-testnet": {
            url: "https://data-seed-prebsc-1-s1.binance.org:8545/",
            chainId: 97,
            accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
            gasPrice: 10000000000, // 10 gwei
        },
        "bsc-mainnet": {
            url: "https://bsc-dataseed.binance.org/",
            chainId: 56,
            accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
            gasPrice: 5000000000, // 5 gwei
        },
    },
    sourcify: {
        enabled: true,
    },
    etherscan: {
        apiKey: {
            bsc: process.env.BSCSCAN_API_KEY || "",
            bscTestnet: process.env.BSCSCAN_API_KEY || "",
        },
    },
    gasReporter: {
        enabled: process.env.REPORT_GAS !== undefined,
        currency: "USD",
        coinmarketcap: process.env.COINMARKETCAP_API_KEY,
    },
    contractSizer: {
        alphaSort: true,
        disambiguatePaths: false,
        runOnCompile: true,
        strict: false,
    },
    mocha: {
        timeout: 40000,
    },
    typechain: {
        outDir: "typechain-types",
        target: "ethers-v6",
        alwaysGenerateOverloads: false,
        discriminateTypes: true,
        tsNocheck: false,
    },
    paths: {
        sources: "./src",
        tests: "./test",
        cache: "./cache",
        artifacts: "./artifacts",
    },
};
