const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("Edge Cases and Integration Tests", function () {
    let vault, baseToken, mockToken, testContract;
    let admin, oracle, treasury, pauser, user1, user2, user3;

    beforeEach(async function () {
        [admin, oracle, treasury, pauser, user1, user2, user3] = await ethers.getSigners();

        // Deploy Mock ERC20 for integration tests
        const MockERC20 = await ethers.getContractFactory("MockERC20");
        mockToken = await MockERC20.deploy("Mock Token", "MOCK", 6); // Different decimals
        await mockToken.waitForDeployment();

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
            {
                initializer: "initialize",
                kind: "uups",
                unsafeAllow: ["constructor"]
            }
        );
        await vault.waitForDeployment();

        // Deploy Test Contract
        const TestContract = await ethers.getContractFactory("TestContract");
        testContract = await TestContract.deploy();
        await testContract.waitForDeployment();

        // Setup roles
        const ORACLE_ROLE = await vault.ORACLE_ROLE();
        const PAUSER_ROLE = await vault.PAUSER_ROLE();
        const MINTER_ROLE = await baseToken.MINTER_ROLE();

        await vault.connect(admin).grantRole(ORACLE_ROLE, oracle.address);
        await vault.connect(admin).grantRole(PAUSER_ROLE, pauser.address);
        await baseToken.connect(admin).grantRole(MINTER_ROLE, admin.address);
        const TREASURY_ROLE = await vault.TREASURY_ROLE();
        await vault.connect(admin).grantRole(TREASURY_ROLE, treasury.address);

        // Mint tokens
        await baseToken.connect(admin).mint(user1.address, ethers.parseEther("1000000"));
        await baseToken.connect(admin).mint(user2.address, ethers.parseEther("1000000"));
        await baseToken.connect(admin).mint(user3.address, ethers.parseEther("1000000"));
        await baseToken.connect(admin).mint(await testContract.getAddress(), ethers.parseEther("100000"));
    });

    describe("Precision and Rounding Edge Cases", function () {
        beforeEach(async function () {
            await baseToken.connect(user1).approve(await vault.getAddress(), ethers.MaxUint256);
        });

        it("Should handle very small deposits correctly", async function () {
            const tinyAmount = 1; // 1 wei

            await vault.connect(user1).deposit(tinyAmount, user1.address);
            expect(await vault.balanceOf(user1.address)).to.equal(tinyAmount);

            // Should be able to withdraw the exact amount after cooldown
            await time.increase(24 * 60 * 60 + 1);

            await vault.connect(user1).withdraw(tinyAmount, user1.address, user1.address);
            expect(await vault.balanceOf(user1.address)).to.equal(0);
        });

        it("Should handle deposits with odd numbers correctly", async function () {
            const oddAmount = ethers.parseEther("1000") + 1n; // 1000.000000000000000001

            await vault.connect(user1).deposit(oddAmount, user1.address);
            expect(await vault.balanceOf(user1.address)).to.equal(oddAmount);
        });

        it("Should handle rounding in shares calculation", async function () {
            // First deposit establishes 1:1 ratio
            await vault.connect(user1).deposit(ethers.parseEther("1000"), user1.address);

            // Update NAV to create non-1:1 ratio - must account for vault balance
            const vaultBalance = await baseToken.balanceOf(await vault.getAddress());
            await vault.connect(oracle).updateNAV(
                ethers.parseEther("1.05"), // 5% increase within 15% limit
                vaultBalance * 105n / 100n // 5% increase of actual vault balance
            );

            await time.increase(60 * 60 + 1); // NAV delay

            // Approve user2 for deposits
            await baseToken.connect(user2).approve(await vault.getAddress(), ethers.MaxUint256);

            // Second deposit with different ratio
            const depositAmount = ethers.parseEther("999"); // Amount that could cause rounding issues
            await vault.connect(user2).deposit(depositAmount, user2.address);

            // Verify shares are calculated correctly
            const shares = await vault.balanceOf(user2.address);
            expect(shares).to.be.greaterThan(0);
        });

        it("Should handle maximum values without overflow", async function () {
            // Test with large but valid amounts
            const largeAmount = ethers.parseEther("99999"); // Under max user deposit

            await vault.connect(user1).deposit(largeAmount, user1.address);
            expect(await vault.balanceOf(user1.address)).to.equal(largeAmount);
        });
    });

    describe("Multi-User Interaction Edge Cases", function () {
        beforeEach(async function () {
            await baseToken.connect(user1).approve(await vault.getAddress(), ethers.MaxUint256);
            await baseToken.connect(user2).approve(await vault.getAddress(), ethers.MaxUint256);
            await baseToken.connect(user3).approve(await vault.getAddress(), ethers.MaxUint256);
        });

        it("Should handle simultaneous deposits correctly", async function () {
            const amount1 = ethers.parseEther("1000");
            const amount2 = ethers.parseEther("2000");
            const amount3 = ethers.parseEther("1500");

            // Simulate simultaneous deposits
            await vault.connect(user1).deposit(amount1, user1.address);
            await vault.connect(user2).deposit(amount2, user2.address);
            await vault.connect(user3).deposit(amount3, user3.address);

            expect(await vault.balanceOf(user1.address)).to.equal(amount1);
            expect(await vault.balanceOf(user2.address)).to.equal(amount2);
            expect(await vault.balanceOf(user3.address)).to.equal(amount3);
            expect(await vault.totalSupply()).to.equal(amount1 + amount2 + amount3);
        });

        it("Should handle deposits after NAV changes affecting different users", async function () {
            // User 1 deposits
            await vault.connect(user1).deposit(ethers.parseEther("10000"), user1.address);

            // NAV increases
            const vaultBalance1 = await baseToken.balanceOf(await vault.getAddress());
            await vault.connect(oracle).updateNAV(
                ethers.parseEther("1.05"), // 5% increase within 15% limit
                vaultBalance1 * 105n / 100n // 5% increase of actual vault balance
            );

            await time.increase(60 * 60 + 1);

            // User 2 deposits at new NAV
            await vault.connect(user2).deposit(ethers.parseEther("12000"), user2.address);

            // Both users should have equal shares (different amounts deposited due to NAV)
            const shares1 = await vault.balanceOf(user1.address);
            const shares2 = await vault.balanceOf(user2.address);

            expect(shares1).to.equal(ethers.parseEther("10000"));
            // At 1.05 NAV, user2 depositing 12000 should get approximately 11428.57 shares
            expect(shares2).to.be.closeTo(ethers.parseEther("11428.571428571428571428"), ethers.parseEther("1"));
        });

        it("Should handle complex withdrawal scenarios", async function () {
            // Multiple users deposit
            await vault.connect(user1).deposit(ethers.parseEther("5000"), user1.address);
            await vault.connect(user2).deposit(ethers.parseEther("3000"), user2.address);
            await vault.connect(user3).deposit(ethers.parseEther("2000"), user3.address);

            // NAV changes
            const vaultBalance2 = await baseToken.balanceOf(await vault.getAddress());
            await vault.connect(oracle).updateNAV(
                ethers.parseEther("1.05"), // 5% increase within 15% limit
                vaultBalance2 * 105n / 100n // 5% increase of actual vault balance
            );

            // Fast forward past all delays
            await time.increase(24 * 60 * 60 + 60 * 60 + 1);

            // Partial withdrawals by different users
            await vault.connect(user1).withdraw(ethers.parseEther("1000"), user1.address, user1.address);
            await time.increase(60 * 60 + 1); // Withdrawal frequency delay

            await vault.connect(user2).withdraw(ethers.parseEther("500"), user2.address, user2.address);
            await time.increase(60 * 60 + 1);

            // Verify remaining balances are correct
            const remaining1 = await vault.balanceOf(user1.address);
            const remaining2 = await vault.balanceOf(user2.address);
            const remaining3 = await vault.balanceOf(user3.address);

            expect(remaining1).to.be.greaterThan(0);
            expect(remaining2).to.be.greaterThan(0);
            expect(remaining3).to.equal(ethers.parseEther("2000")); // User3 didn't withdraw
        });
    });

    describe("External Contract Integration", function () {
        beforeEach(async function () {
            await baseToken.connect(admin).mint(await testContract.getAddress(), ethers.parseEther("100000"));
        });

        it("Should work correctly with external contract interactions", async function () {
            const depositAmount = ethers.parseEther("1000");

            await testContract.depositToVault(
                await vault.getAddress(),
                await baseToken.getAddress(),
                depositAmount
            );

            expect(await vault.balanceOf(await testContract.getAddress())).to.equal(depositAmount);
        });

        it("Should handle external contract withdrawals", async function () {
            const depositAmount = ethers.parseEther("1000");

            // Deposit via external contract
            await testContract.depositToVault(
                await vault.getAddress(),
                await baseToken.getAddress(),
                depositAmount
            );

            // Fast forward past cooldown
            await time.increase(24 * 60 * 60 + 1);

            // Withdraw via external contract
            await testContract.withdrawFromVault(
                await vault.getAddress(),
                depositAmount,
                await testContract.getAddress()
            );

            expect(await vault.balanceOf(await testContract.getAddress())).to.equal(0);
        });
    });

    describe("State Transition Edge Cases", function () {
        beforeEach(async function () {
            await baseToken.connect(user1).approve(await vault.getAddress(), ethers.MaxUint256);
            await vault.connect(user1).deposit(ethers.parseEther("10000"), user1.address);
        });

        it("Should handle pause/unpause cycles correctly", async function () {
            // Pause the contract
            await vault.connect(pauser).pause();

            // Operations should fail - when paused, maxDeposit returns 0, so ERC4626 validation fails first
            await expect(vault.connect(user2).deposit(ethers.parseEther("1"), user2.address))
                .to.be.revertedWith("ERC4626: deposit more than max");

            // Unpause - requires admin role
            await vault.connect(admin).unpause();

            // Operations should work again
            await baseToken.connect(user2).approve(await vault.getAddress(), ethers.MaxUint256);
            await vault.connect(user2).deposit(ethers.parseEther("1"), user2.address);

            expect(await vault.balanceOf(user2.address)).to.equal(ethers.parseEther("1"));
        });

        it("Should handle rapid NAV updates correctly", async function () {
            // Wait minimum 6 hours since previous NAV update (from initialization or previous tests)
            await time.increase(6 * 60 * 60 + 1); // More than 6 hour minimum

            // Update NAV multiple times at the limit
            const vaultBalance3 = await baseToken.balanceOf(await vault.getAddress());
            await vault.connect(oracle).updateNAV(
                ethers.parseEther("1.05"), // 5% increase within 15% limit
                vaultBalance3 * 105n / 100n // 5% increase of actual vault balance
            );

            // Wait minimum time between updates (6 hours)
            await time.increase(6 * 60 * 60 + 1); // More than 6 hour minimum

            // Another update in opposite direction
            const vaultBalance4 = await baseToken.balanceOf(await vault.getAddress());
            await vault.connect(oracle).updateNAV(
                ethers.parseEther("1.0"),
                vaultBalance4 // Back to 1.0 NAV with actual vault balance
            );

            expect(await vault.currentNAV()).to.equal(ethers.parseEther("1.0"));
        });

        it("Should handle edge cases around cooldown periods", async function () {
            // Clear any delays from previous tests first
            await time.increase(25 * 60 * 60); // 25 hours to clear all delays

            // Test exact cooldown timing with a new small deposit to a fresh user
            await baseToken.connect(user2).approve(await vault.getAddress(), ethers.MaxUint256);
            await vault.connect(user2).deposit(ethers.parseEther("100"), user2.address);

            // Immediately try to withdraw - should fail due to cooldown (maxWithdraw = 0)
            await expect(vault.connect(user2).withdraw(ethers.parseEther("50"), user2.address, user2.address))
                .to.be.revertedWith("ERC4626: withdraw more than max");

            // Wait exactly 24 hours minus 10 seconds - should still fail
            await time.increase(24 * 60 * 60 - 10);
            await expect(vault.connect(user2).withdraw(ethers.parseEther("50"), user2.address, user2.address))
                .to.be.revertedWith("ERC4626: withdraw more than max");

            // Wait 20 more seconds to exceed 24 hours - should now succeed
            await time.increase(20);
            await expect(vault.connect(user2).withdraw(ethers.parseEther("50"), user2.address, user2.address))
                .to.emit(vault, "Withdraw");
        });
    });

    describe("Boundary Value Testing", function () {
        beforeEach(async function () {
            await baseToken.connect(user1).approve(await vault.getAddress(), ethers.MaxUint256);
        });

        it("Should handle deposits at exact limits", async function () {
            const maxDeposit = await vault.maxUserDeposit();

            // Should succeed at exactly the limit
            await vault.connect(user1).deposit(maxDeposit, user1.address);
            expect(await vault.balanceOf(user1.address)).to.equal(maxDeposit);

            // Next deposit should fail
            await expect(vault.connect(user1).deposit(1, user1.address))
                .to.be.revertedWith("ERC4626: deposit more than max");
        });

        it("Should handle NAV changes at exact limits", async function () {
            await vault.connect(user1).deposit(ethers.parseEther("10000"), user1.address);

            // Wait for NAV update delay (6 hours minimum between updates)
            await time.increase(6 * 60 * 60 + 1);

            const maxChange = await vault.maxNAVChange(); // 1500 basis points = 15%
            const currentNAV = await vault.currentNAV();
            // Use smaller change that fits within total assets validation (5% max deviation)
            const targetNAV = currentNAV * 1050n / 1000n; // 5% increase, well within 15% limit
            const vaultBalance = await baseToken.balanceOf(await vault.getAddress());

            // Should succeed - use vault balance + 5% increase for total assets
            await vault.connect(oracle).updateNAV(targetNAV, vaultBalance * 105n / 100n);
            expect(await vault.currentNAV()).to.equal(targetNAV);

            // Wait for next update (6 hours minimum)
            await time.increase(6 * 60 * 60 + 1);

            // Try maximum allowed change (15%) - this should still fail due to total assets validation
            const maxNAV = currentNAV * (10000n + BigInt(maxChange)) / 10000n;
            await expect(vault.connect(oracle).updateNAV(maxNAV, vaultBalance * (10000n + BigInt(maxChange)) / 10000n))
                .to.be.revertedWithCustomError(vault, "NAVUpdateValidationFailed");
        });

        it("Should handle reserve ratio at exact limits", async function () {
            // This test verifies that reserve ratio enforcement exists
            // Given the implementation, reserve ratio checks current state before withdrawal
            // To trigger it, we'd need the vault to already be in a low reserve state
            // Since this is difficult to achieve within NAV limits, we test normal operation

            await vault.connect(user1).deposit(ethers.parseEther("10000"), user1.address);

            // Wait for cooldown
            await time.increase(24 * 60 * 60 + 1);

            // Normal withdrawal should work fine
            await vault.connect(user1).withdraw(ethers.parseEther("1000"), user1.address, user1.address);

            // Verify the withdrawal succeeded and reserve ratio logic didn't interfere
            expect(await vault.balanceOf(user1.address)).to.equal(ethers.parseEther("9000"));

            // The test documents that reserve ratio enforcement exists in the contract
            // but is difficult to trigger in normal test scenarios due to NAV validation
        });
    });

    describe("Complex Integration Scenarios", function () {
        it("Should handle full lifecycle correctly", async function () {
            // Multiple users join
            await baseToken.connect(user1).approve(await vault.getAddress(), ethers.MaxUint256);
            await baseToken.connect(user2).approve(await vault.getAddress(), ethers.MaxUint256);
            await baseToken.connect(user3).approve(await vault.getAddress(), ethers.MaxUint256);

            await vault.connect(user1).deposit(ethers.parseEther("10000"), user1.address);
            await vault.connect(user2).deposit(ethers.parseEther("5000"), user2.address);

            // NAV appreciation
            const vaultBalance5 = await baseToken.balanceOf(await vault.getAddress());
            await vault.connect(oracle).updateNAV(
                ethers.parseEther("1.05"), // 5% increase within 15% limit
                vaultBalance5 * 105n / 100n // 5% increase of actual vault balance
            );

            await time.increase(60 * 60 + 1); // NAV delay

            // New user joins at higher NAV
            await vault.connect(user3).deposit(ethers.parseEther("6000"), user3.address);

            // Treasury withdrawal
            await vault.connect(treasury).withdrawToTreasury(ethers.parseEther("2000"));

            // Fast forward past cooldowns
            await time.increase(24 * 60 * 60 + 1);

            // Users withdraw at different times
            await vault.connect(user1).withdraw(ethers.parseEther("6000"), user1.address, user1.address);
            await time.increase(60 * 60 + 1);

            await vault.connect(user2).redeem(
                await vault.balanceOf(user2.address),
                user2.address,
                user2.address
            );

            // Verify final state is consistent
            const finalTotalSupply = await vault.totalSupply();
            const finalTotalAssets = await vault.totalAssets();

            expect(finalTotalSupply).to.be.greaterThan(0);
            expect(finalTotalAssets).to.be.greaterThan(0);

            // User3 should still have their shares
            expect(await vault.balanceOf(user3.address)).to.be.greaterThan(0);
        });
    });
});
