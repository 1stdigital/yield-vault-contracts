const { ethers, upgrades } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

/**
 * Test utility functions for ERC4626YieldVault testing
 */

class TestHelpers {
    /**
     * Deploy a full test environment
     */
    static async deployFullEnvironment() {
        const [admin, oracle, treasury, pauser, upgrader, user1, user2, malicious] = await ethers.getSigners();

        // Deploy Base Token
        const BaseToken = await ethers.getContractFactory("BaseToken");
        const baseToken = await upgrades.deployProxy(
            BaseToken,
            ["Base Token", "BASE", admin.address],
            { initializer: "initialize", kind: "uups" }
        );
        await baseToken.waitForDeployment();

        // Deploy Vault
        const ERC4626YieldVault = await ethers.getContractFactory("ERC4626YieldVault");
        const vault = await upgrades.deployProxy(
            ERC4626YieldVault,
            [
                await baseToken.getAddress(),
                "Yield Vault Shares",
                "YVS",
                treasury.address,
                admin.address
            ],
            { initializer: "initialize", kind: "uups" }
        );
        await vault.waitForDeployment();

        // Setup roles
        const ORACLE_ROLE = await vault.ORACLE_ROLE();
        const TREASURY_ROLE = await vault.TREASURY_ROLE();
        const PAUSER_ROLE = await vault.PAUSER_ROLE();
        const UPGRADER_ROLE = await vault.UPGRADER_ROLE();
        const MINTER_ROLE = await baseToken.MINTER_ROLE();

        await vault.connect(admin).grantRole(ORACLE_ROLE, oracle.address);
        await vault.connect(admin).grantRole(TREASURY_ROLE, treasury.address);
        await vault.connect(admin).grantRole(PAUSER_ROLE, pauser.address);
        await vault.connect(admin).grantRole(UPGRADER_ROLE, upgrader.address);
        await baseToken.connect(admin).grantRole(MINTER_ROLE, admin.address);

        // Mint tokens for testing
        const users = [user1, user2, malicious];
        for (const user of users) {
            await baseToken.connect(admin).mint(user.address, ethers.parseEther("1000000"));
        }

        return {
            vault,
            baseToken,
            accounts: {
                admin,
                oracle,
                treasury,
                pauser,
                upgrader,
                user1,
                user2,
                malicious
            }
        };
    }

    /**
     * Deploy test contracts (MockERC20, TestContract, Malicious contracts)
     */
    static async deployTestContracts(vault, baseToken) {
        // Deploy Mock ERC20
        const MockERC20 = await ethers.getContractFactory("MockERC20");
        const mockToken = await MockERC20.deploy("Mock Stable Token", "MST", 18);
        await mockToken.waitForDeployment();

        // Deploy Test Contract
        const TestContract = await ethers.getContractFactory("TestContract");
        const testContract = await TestContract.deploy();
        await testContract.waitForDeployment();

        // Deploy Malicious Contracts
        const MaliciousReentrancy = await ethers.getContractFactory("MaliciousReentrancy");
        const maliciousReentrancy = await MaliciousReentrancy.deploy(
            await vault.getAddress(),
            await baseToken.getAddress()
        );
        await maliciousReentrancy.waitForDeployment();

        const FlashLoanAttacker = await ethers.getContractFactory("FlashLoanAttacker");
        const flashLoanAttacker = await FlashLoanAttacker.deploy(
            await vault.getAddress(),
            await baseToken.getAddress()
        );
        await flashLoanAttacker.waitForDeployment();

        const MaliciousUpgrade = await ethers.getContractFactory("MaliciousUpgrade");
        const maliciousUpgrade = await MaliciousUpgrade.deploy();
        await maliciousUpgrade.waitForDeployment();

        return {
            mockToken,
            testContract,
            maliciousReentrancy,
            flashLoanAttacker,
            maliciousUpgrade
        };
    }

    /**
     * Setup approvals for testing
     */
    static async setupApprovals(baseToken, vault, users) {
        for (const user of users) {
            await baseToken.connect(user).approve(await vault.getAddress(), ethers.MaxUint256);
        }
    }

    /**
     * Fast forward past withdrawal cooldown
     */
    static async passWithdrawalCooldown() {
        await time.increase(24 * 60 * 60 + 1); // 24 hours + 1 second
    }

    /**
     * Fast forward past NAV update delay
     */
    static async passNAVUpdateDelay() {
        await time.increase(60 * 60 + 1); // 1 hour + 1 second
    }

    /**
     * Fast forward past withdrawal frequency limit
     */
    static async passWithdrawalFrequencyLimit() {
        await time.increase(60 * 60 + 1); // 1 hour + 1 second
    }

    /**
     * Calculate expected shares for a given deposit amount and NAV
     */
    static calculateExpectedShares(depositAmount, nav, totalSupply, totalAssets) {
        if (totalSupply === 0n) {
            return depositAmount;
        }
        return (depositAmount * totalSupply) / totalAssets;
    }

    /**
     * Calculate expected assets for a given share amount and NAV
     */
    static calculateExpectedAssets(shareAmount, nav, totalSupply, totalAssets) {
        if (totalSupply === 0n) {
            return shareAmount;
        }
        return (shareAmount * totalAssets) / totalSupply;
    }

    /**
     * Perform a complete deposit-wait-withdraw cycle
     */
    static async performDepositWithdrawCycle(vault, baseToken, user, amount) {
        // Ensure approval
        await baseToken.connect(user).approve(await vault.getAddress(), ethers.MaxUint256);

        // Deposit
        await vault.connect(user).deposit(amount, user.address);
        const shares = await vault.balanceOf(user.address);

        // Wait for cooldown
        await this.passWithdrawalCooldown();

        // Withdraw
        await vault.connect(user).redeem(shares, user.address, user.address);

        return shares;
    }

    /**
     * Create a scenario with multiple users and deposits
     */
    static async createMultiUserScenario(vault, baseToken, users, amounts) {
        const results = [];

        for (let i = 0; i < users.length; i++) {
            await baseToken.connect(users[i]).approve(await vault.getAddress(), ethers.MaxUint256);
            await vault.connect(users[i]).deposit(amounts[i], users[i].address);

            results.push({
                user: users[i],
                amount: amounts[i],
                shares: await vault.balanceOf(users[i].address)
            });
        }

        return results;
    }

    /**
     * Simulate NAV appreciation/depreciation
     */
    static async simulateNAVChange(vault, oracle, changePercent, totalAssets) {
        const currentNAV = await vault.currentNAV();
        const newNAV = currentNAV * BigInt(10000 + changePercent * 100) / 10000n;
        const newTotalAssets = totalAssets * BigInt(10000 + changePercent * 100) / 10000n;

        await vault.connect(oracle).updateNAV(newNAV, newTotalAssets);
        await this.passNAVUpdateDelay();

        return { newNAV, newTotalAssets };
    }

    /**
     * Assert that gas usage is within expected range
     */
    static assertGasUsage(receipt, maxGas, operation = "operation") {
        const gasUsed = Number(receipt.gasUsed);
        if (gasUsed > maxGas) {
            throw new Error(`${operation} used ${gasUsed} gas, expected less than ${maxGas}`);
        }
        console.log(`${operation} gas usage: ${gasUsed} (limit: ${maxGas})`);
    }

    /**
     * Create test data for fuzz testing
     */
    static generateFuzzTestData(count = 10) {
        const data = [];
        for (let i = 0; i < count; i++) {
            data.push({
                depositAmount: ethers.parseEther((Math.random() * 10000 + 1).toString()),
                navChange: (Math.random() - 0.5) * 30, // -15% to +15%
                waitTime: Math.floor(Math.random() * 7 * 24 * 60 * 60) + 24 * 60 * 60 // 1-7 days
            });
        }
        return data;
    }

    /**
     * Verify vault invariants
     */
    static async verifyVaultInvariants(vault, baseToken) {
        const totalSupply = await vault.totalSupply();
        const totalAssets = await vault.totalAssets();
        const vaultBalance = await baseToken.balanceOf(await vault.getAddress());
        const totalAssetsManaged = await vault.totalAssetsManaged();

        // Basic invariants
        if (totalSupply > 0n) {
            if (totalAssets === 0n) {
                throw new Error("Total assets should not be zero when shares exist");
            }
        }

        if (vaultBalance > totalAssets) {
            throw new Error("Vault balance should not exceed total assets");
        }

        console.log(`Vault invariants verified: Supply=${totalSupply}, Assets=${totalAssets}, Balance=${vaultBalance}`);
    }

    /**
     * Constants for testing
     */
    static get CONSTANTS() {
        return {
            WITHDRAWAL_COOLDOWN: 24 * 60 * 60, // 24 hours
            NAV_UPDATE_DELAY: 60 * 60, // 1 hour
            WITHDRAWAL_FREQUENCY_LIMIT: 60 * 60, // 1 hour
            MAX_USER_DEPOSIT: ethers.parseEther("100000"),
            MAX_TOTAL_DEPOSITS: ethers.parseEther("1000000"),
            MIN_RESERVE_RATIO: 2000, // 20%
            MAX_NAV_CHANGE: 1500, // 15%
            INITIAL_NAV: ethers.parseEther("1")
        };
    }

    /**
     * Error messages for testing
     */
    static get ERRORS() {
        return {
            REENTRANCY: "ReentrancyGuardReentrantCall",
            WITHDRAWAL_COOLDOWN: "WithdrawalCooldownActive",
            ACCESS_CONTROL: "AccessControlUnauthorizedAccount",
            NAV_LIMIT: "NAVChangeExceedsLimit",
            RESERVE_RATIO: "InsufficientReserveRatio",
            WITHDRAWAL_FREQUENCY: "WithdrawalTooFrequent",
            RECENT_NAV_CHANGE: "RecentNAVChange",
            USER_DEPOSIT_LIMIT: "ExceedsUserDepositLimit",
            TOTAL_DEPOSIT_LIMIT: "ExceedsTotalDepositLimit",
            ZERO_AMOUNT: "ZeroAmount",
            ENFORCED_PAUSE: "EnforcedPause"
        };
    }
}

module.exports = { TestHelpers };
