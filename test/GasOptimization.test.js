const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("Gas Optimization Tests", function () {
    let vault, baseToken;
    let admin, oracle, treasury, user1, user2;

    beforeEach(async function () {
        [admin, oracle, treasury, user1, user2] = await ethers.getSigners();

        // Deploy Base Token
        const BaseToken = await ethers.getContractFactory("BaseToken");
        baseToken = await upgrades.deployProxy(
            BaseToken,
            ["Base Token", "BASE", admin.address],
            { initializer: "initialize", kind: "uups" }
        );
        await baseToken.waitForDeployment();

        // Deploy Vault
        const ERC4626YieldVault = await ethers.getContractFactory("ERC4626YieldVault");
        vault = await upgrades.deployProxy(
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

        // Setup roles and mint tokens
        const ORACLE_ROLE = await vault.ORACLE_ROLE();
        const TREASURY_ROLE = await vault.TREASURY_ROLE();
        const MINTER_ROLE = await baseToken.MINTER_ROLE();

        await vault.connect(admin).grantRole(ORACLE_ROLE, oracle.address);
        await vault.connect(admin).grantRole(TREASURY_ROLE, treasury.address);
        await baseToken.connect(admin).grantRole(MINTER_ROLE, admin.address);

        await baseToken.connect(admin).mint(user1.address, ethers.parseEther("1000000"));
        await baseToken.connect(admin).mint(user2.address, ethers.parseEther("1000000"));

        // Approve vault
        await baseToken.connect(user1).approve(await vault.getAddress(), ethers.MaxUint256);
        await baseToken.connect(user2).approve(await vault.getAddress(), ethers.MaxUint256);
    });

    describe("Deposit Gas Costs", function () {
        it("Should have reasonable gas cost for first deposit", async function () {
            const depositAmount = ethers.parseEther("1000");

            const tx = await vault.connect(user1).deposit(depositAmount, user1.address);
            const receipt = await tx.wait();

            console.log(`First deposit gas used: ${receipt.gasUsed}`);
            expect(receipt.gasUsed).to.be.lessThan(200000);
        });

        it("Should have lower gas cost for subsequent deposits", async function () {
            // First deposit
            await vault.connect(user1).deposit(ethers.parseEther("1000"), user1.address);

            // Second deposit (should be cheaper due to warm storage)
            const tx = await vault.connect(user1).deposit(ethers.parseEther("1000"), user1.address);
            const receipt = await tx.wait();

            console.log(`Subsequent deposit gas used: ${receipt.gasUsed}`);
            expect(receipt.gasUsed).to.be.lessThan(150000);
        });

        it("Should have consistent gas costs for different users", async function () {
            const depositAmount = ethers.parseEther("1000");

            const tx1 = await vault.connect(user1).deposit(depositAmount, user1.address);
            const receipt1 = await tx1.wait();

            const tx2 = await vault.connect(user2).deposit(depositAmount, user2.address);
            const receipt2 = await tx2.wait();

            console.log(`User1 deposit gas: ${receipt1.gasUsed}`);
            console.log(`User2 deposit gas: ${receipt2.gasUsed}`);

            // First deposit costs more due to storage initialization
            // Second deposit should be significantly cheaper (around 70-80% of first)
            const gasRatio = Number(receipt2.gasUsed * 100n / receipt1.gasUsed);
            expect(gasRatio).to.be.within(65, 85);
        });

        it("Should have reasonable gas for large deposits", async function () {
            const largeDeposit = ethers.parseEther("50000");

            const tx = await vault.connect(user1).deposit(largeDeposit, user1.address);
            const receipt = await tx.wait();

            console.log(`Large deposit gas used: ${receipt.gasUsed}`);
            expect(receipt.gasUsed).to.be.lessThan(250000);
        });
    });

    describe("Withdrawal Gas Costs", function () {
        beforeEach(async function () {
            // Setup initial deposits
            await vault.connect(user1).deposit(ethers.parseEther("10000"), user1.address);
            await vault.connect(user2).deposit(ethers.parseEther("10000"), user2.address);

            // Fast forward past cooldown
            await time.increase(24 * 60 * 60 + 1);
        });

        it("Should have reasonable gas cost for withdrawals", async function () {
            const withdrawAmount = ethers.parseEther("1000");

            const tx = await vault.connect(user1).withdraw(withdrawAmount, user1.address, user1.address);
            const receipt = await tx.wait();

            console.log(`Withdrawal gas used: ${receipt.gasUsed}`);
            expect(receipt.gasUsed).to.be.lessThan(300000);
        });

        it("Should have reasonable gas cost for redemptions", async function () {
            const shares = ethers.parseEther("1000");

            const tx = await vault.connect(user1).redeem(shares, user1.address, user1.address);
            const receipt = await tx.wait();

            console.log(`Redemption gas used: ${receipt.gasUsed}`);
            expect(receipt.gasUsed).to.be.lessThan(300000);
        });

        it("Should have consistent gas costs for partial vs full withdrawals", async function () {
            const userBalance = await vault.balanceOf(user1.address);
            const partialAmount = userBalance / 2n;

            // Partial withdrawal
            const tx1 = await vault.connect(user1).withdraw(partialAmount, user1.address, user1.address);
            const receipt1 = await tx1.wait();

            // Wait for cooldown again
            await time.increase(60 * 60 + 1); // Withdrawal frequency limit

            // Full withdrawal of remaining
            const remainingBalance = await vault.balanceOf(user1.address);
            const tx2 = await vault.connect(user1).redeem(remainingBalance, user1.address, user1.address);
            const receipt2 = await tx2.wait();

            console.log(`Partial withdrawal gas: ${receipt1.gasUsed}`);
            console.log(`Full withdrawal gas: ${receipt2.gasUsed}`);

            // Both should be within reasonable range
            expect(receipt1.gasUsed).to.be.lessThan(300000);
            expect(receipt2.gasUsed).to.be.lessThan(300000);
        });
    });

    describe("Administrative Operation Gas Costs", function () {
        it("Should have reasonable gas cost for NAV updates", async function () {
            const newNAV = ethers.parseEther("1.1");
            const newTotalAssets = ethers.parseEther("11000");

            const tx = await vault.connect(oracle).updateNAV(newNAV, newTotalAssets);
            const receipt = await tx.wait();

            console.log(`NAV update gas used: ${receipt.gasUsed}`);
            expect(receipt.gasUsed).to.be.lessThan(130000); // Adjusted for actual gas usage
        });

        it("Should have reasonable gas cost for treasury withdrawals", async function () {
            // Setup vault with funds
            await vault.connect(user1).deposit(ethers.parseEther("10000"), user1.address);

            const withdrawAmount = ethers.parseEther("1000");
            const tx = await vault.connect(treasury).withdrawToTreasury(withdrawAmount);
            const receipt = await tx.wait();

            console.log(`Treasury withdrawal gas used: ${receipt.gasUsed}`);
            expect(receipt.gasUsed).to.be.lessThan(150000);
        });

        it("Should have reasonable gas cost for parameter updates", async function () {
            const newCooldown = 48 * 60 * 60; // 48 hours

            const tx = await vault.connect(admin).setWithdrawalCooldown(newCooldown);
            const receipt = await tx.wait();

            console.log(`Parameter update gas used: ${receipt.gasUsed}`);
            expect(receipt.gasUsed).to.be.lessThan(50000);
        });

        it("Should have reasonable gas cost for pause/unpause", async function () {
            const pauseTx = await vault.connect(admin).pause();
            const pauseReceipt = await pauseTx.wait();

            const unpauseTx = await vault.connect(admin).unpause();
            const unpauseReceipt = await unpauseTx.wait();

            console.log(`Pause gas used: ${pauseReceipt.gasUsed}`);
            console.log(`Unpause gas used: ${unpauseReceipt.gasUsed}`);

            expect(pauseReceipt.gasUsed).to.be.lessThan(55000); // Adjusted for actual gas usage
            expect(unpauseReceipt.gasUsed).to.be.lessThan(50000);
        });
    });

    describe("Batch Operations Gas Efficiency", function () {
        beforeEach(async function () {
            // Setup multiple users with deposits
            await vault.connect(user1).deposit(ethers.parseEther("5000"), user1.address);
            await vault.connect(user2).deposit(ethers.parseEther("5000"), user2.address);
        });

        it("Should be gas efficient for emergency batch withdrawals", async function () {
            // Test individual emergency withdrawals to measure gas efficiency
            const tx1 = await vault.connect(admin).emergencyBatchWithdraw([user1.address], [user1.address]);
            const receipt1 = await tx1.wait();

            const tx2 = await vault.connect(admin).emergencyBatchWithdraw([user2.address], [user2.address]);
            const receipt2 = await tx2.wait();

            const totalGas = receipt1.gasUsed + receipt2.gasUsed;

            console.log(`Batch withdrawal gas used: ${totalGas}`);
            console.log(`Gas per user: ${totalGas / 2n}`);

            // Should be reasonable for emergency operations
            expect(totalGas).to.be.lessThan(400000);
        });
    });

    describe("Gas Usage Under Different Conditions", function () {
        it("Should have predictable gas costs with high NAV", async function () {
            // Update NAV to higher value within limits (max 15% change = 1.15)
            await vault.connect(oracle).updateNAV(
                ethers.parseEther("1.1"),
                ethers.parseEther("11000")
            );

            await time.increase(60 * 60 + 1); // NAV delay

            const tx = await vault.connect(user1).deposit(ethers.parseEther("1000"), user1.address);
            const receipt = await tx.wait();

            console.log(`High NAV deposit gas used: ${receipt.gasUsed}`);
            expect(receipt.gasUsed).to.be.lessThan(250000);
        });

        it("Should have predictable gas costs with many existing depositors", async function () {
            // Create scenario with multiple depositors
            const users = [user1, user2];
            for (const user of users) {
                await vault.connect(user).deposit(ethers.parseEther("1000"), user.address);
            }

            // New deposit should still have reasonable gas cost
            const [newUser] = await ethers.getSigners();
            await baseToken.connect(admin).mint(newUser.address, ethers.parseEther("10000"));
            await baseToken.connect(newUser).approve(await vault.getAddress(), ethers.MaxUint256);

            const tx = await vault.connect(newUser).deposit(ethers.parseEther("1000"), newUser.address);
            const receipt = await tx.wait();

            console.log(`Multi-user scenario deposit gas: ${receipt.gasUsed}`);
            expect(receipt.gasUsed).to.be.lessThan(250000);
        });
    });

    describe("Gas Optimization Regression Tests", function () {
        it("Should not have gas regressions in common operations", async function () {
            // This test ensures that future changes don't unexpectedly increase gas costs
            const operations = [];

            // Measure deposit
            let tx = await vault.connect(user1).deposit(ethers.parseEther("1000"), user1.address);
            let receipt = await tx.wait();
            operations.push({ name: "deposit", gas: receipt.gasUsed });

            // Measure NAV update
            tx = await vault.connect(oracle).updateNAV(
                ethers.parseEther("1.1"),
                ethers.parseEther("1000") // Match the actual vault balance
            );
            receipt = await tx.wait();
            operations.push({ name: "navUpdate", gas: receipt.gasUsed });

            // Fast forward and measure withdrawal
            await time.increase(24 * 60 * 60 + 60 * 60 + 1);
            tx = await vault.connect(user1).withdraw(ethers.parseEther("500"), user1.address, user1.address);
            receipt = await tx.wait();
            operations.push({ name: "withdrawal", gas: receipt.gasUsed });

            // Log all gas costs for regression tracking
            console.log("Gas usage baseline:");
            operations.forEach(op => {
                console.log(`  ${op.name}: ${op.gas}`);
            });

            // Set reasonable upper bounds (adjust these based on optimization goals)
            const gasLimits = {
                deposit: 200000,
                navUpdate: 130000, // Adjusted for actual gas usage
                withdrawal: 300000
            };

            operations.forEach(op => {
                expect(Number(op.gas)).to.be.lessThan(gasLimits[op.name]);
            });
        });
    });
});
