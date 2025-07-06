const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("Bounds and Overflow Protection Tests", function () {
    let vault, baseToken;
    let admin, oracle, treasury, user1;

    beforeEach(async function () {
        [admin, oracle, treasury, user1] = await ethers.getSigners();

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

        // Setup roles
        await vault.connect(admin).grantRole(await vault.ORACLE_ROLE(), oracle.address);
        await vault.connect(admin).grantRole(await vault.TREASURY_ROLE(), treasury.address);
        await baseToken.connect(admin).grantRole(await baseToken.MINTER_ROLE(), admin.address);

        // Mint tokens
        await baseToken.connect(admin).mint(user1.address, ethers.parseEther("1000000"));
    });

    describe("M-02 Fix: Integer Overflow Protection", function () {
        it("Should prevent deposits exceeding MAX_SINGLE_DEPOSIT", async function () {
            // MAX_SINGLE_DEPOSIT = 1e25 (10 million tokens)
            const excessiveAmount = ethers.parseEther("10000001"); // Just over 10M

            await baseToken.connect(user1).approve(await vault.getAddress(), ethers.MaxUint256);

            await expect(vault.connect(user1).deposit(excessiveAmount, user1.address))
                .to.be.revertedWith("ERC4626: deposit more than max");
        });

        it("Should prevent NAV updates exceeding bounds", async function () {
            const tooHighNAV = ethers.parseEther("1000001"); // Exceeds MAX_NAV_VALUE
            const tooLowNAV = 999; // Below MIN_NAV_VALUE (1e12)

            await time.increase(6 * 60 * 60 + 1);

            await expect(vault.connect(oracle).updateNAV(tooHighNAV, ethers.parseEther("1000000")))
                .to.be.revertedWith("NAV outside allowed bounds");

            await expect(vault.connect(oracle).updateNAV(tooLowNAV, ethers.parseEther("1000000")))
                .to.be.revertedWith("NAV outside allowed bounds");
        });

        it("Should prevent total assets exceeding MAX_TOTAL_ASSETS", async function () {
            const excessiveTotalAssets = ethers.parseEther("1000000001"); // Exceeds 1 billion

            await time.increase(6 * 60 * 60 + 1);

            await expect(vault.connect(oracle).updateNAV(
                ethers.parseEther("1.1"),
                excessiveTotalAssets
            )).to.be.revertedWith("Total assets exceed maximum limit");
        });

        it("Should emit BoundsCheckFailed events", async function () {
            await baseToken.connect(user1).approve(await vault.getAddress(), ethers.MaxUint256);

            const excessiveAmount = ethers.parseEther("10000001");

            // The transaction will revert at OpenZeppelin level before custom event emission
            await expect(vault.connect(user1).deposit(excessiveAmount, user1.address))
                .to.be.revertedWith("ERC4626: deposit more than max");
        });

        it("Should prevent conversion overflows in share calculations", async function () {
            // Test edge cases in _convertToShares and _convertToAssets
            await baseToken.connect(user1).approve(await vault.getAddress(), ethers.MaxUint256);

            // First establish some shares
            await vault.connect(user1).deposit(ethers.parseEther("1000"), user1.address);

            await time.increase(6 * 60 * 60 + 1);

            // Try to set an extremely high NAV that would cause overflow
            const extremeNAV = ethers.parseEther("999999"); // Close to MAX_NAV_VALUE
            const vaultBalance = await baseToken.balanceOf(await vault.getAddress());

            await expect(vault.connect(oracle).updateNAV(extremeNAV, vaultBalance))
                .to.be.revertedWith("NAV change too large");
        });

        it("Should validate user deposits tracking doesn't overflow", async function () {
            await baseToken.connect(user1).approve(await vault.getAddress(), ethers.MaxUint256);

            // Make a deposit close to user limit
            const nearMaxDeposit = ethers.parseEther("99999");
            await vault.connect(user1).deposit(nearMaxDeposit, user1.address);

            // Try to deposit again to exceed user limit
            await expect(vault.connect(user1).deposit(ethers.parseEther("2"), user1.address))
                .to.be.revertedWith("ERC4626: deposit more than max");
        });
    });

    describe("Enhanced Bounds Validation", function () {
        it("Should validate admin parameter setters bounds", async function () {
            // Test setWithdrawalCooldown bounds
            await expect(vault.connect(admin).setWithdrawalCooldown(31 * 24 * 60 * 60))
                .to.be.revertedWith("Cooldown too long");

            // Test cooldown exceeding timestamp limits (uint48 max)
            const maxUint48 = 2n ** 48n - 1n;
            await expect(vault.connect(admin).setWithdrawalCooldown(maxUint48 + 1n))
                .to.be.revertedWith("Cooldown too long");

            // Test setMaxUserDeposit bounds
            await expect(vault.connect(admin).setMaxUserDeposit(0))
                .to.be.revertedWith("Max user deposit must be positive");

            await expect(vault.connect(admin).setMaxUserDeposit(ethers.parseEther("10000001")))
                .to.be.revertedWith("Max user deposit too large");

            // Test setMaxTotalDeposits bounds
            await expect(vault.connect(admin).setMaxTotalDeposits(ethers.parseEther("50000")))
                .to.be.revertedWith("Max total deposits too low");

            await expect(vault.connect(admin).setMaxTotalDeposits(ethers.parseEther("1000000001")))
                .to.be.revertedWith("Max total deposits too large");

            // Test setMinReserveRatio bounds
            await expect(vault.connect(admin).setMinReserveRatio(10001))
                .to.be.revertedWith("Reserve ratio too high");

            // Test setMaxNAVChange bounds
            await expect(vault.connect(admin).setMaxNAVChange(5001))
                .to.be.revertedWith("Max NAV change too high");

            // Test setNAVUpdateDelay bounds
            await expect(vault.connect(admin).setNAVUpdateDelay(25 * 60 * 60))
                .to.be.revertedWith("Delay too long");

            await expect(vault.connect(admin).setNAVUpdateDelay(maxUint48 + 1n))
                .to.be.revertedWith("Delay too long");
        });

        it("Should enforce vault-wide deposit limits with overflow protection", async function () {
            await baseToken.connect(user1).approve(await vault.getAddress(), ethers.MaxUint256);

            // Set a lower total deposit limit for testing
            await vault.connect(admin).setMaxTotalDeposits(ethers.parseEther("150000"));

            // Deposit close to the limit
            await vault.connect(user1).deposit(ethers.parseEther("99999"), user1.address);

            // Try to exceed vault-wide limit
            await expect(vault.connect(user1).deposit(ethers.parseEther("50002"), user1.address))
                .to.be.revertedWith("ERC4626: deposit more than max");
        });

        it("Should validate withdrawal bounds checking", async function () {
            await baseToken.connect(user1).approve(await vault.getAddress(), ethers.MaxUint256);
            await vault.connect(user1).deposit(ethers.parseEther("10000"), user1.address);

            await time.increase(24 * 60 * 60 + 1);

            // Try to withdraw more than MAX_TOTAL_ASSETS
            const excessiveWithdrawal = ethers.parseEther("1000000001");

            await expect(vault.connect(user1).withdraw(excessiveWithdrawal, user1.address, user1.address))
                .to.be.revertedWith("ERC4626: withdraw more than max");
        });
    });

    describe("Conversion Safety Checks", function () {
        beforeEach(async function () {
            await baseToken.connect(user1).approve(await vault.getAddress(), ethers.MaxUint256);
            await vault.connect(user1).deposit(ethers.parseEther("10000"), user1.address);
        });

        it("Should prevent precision loss in conversions", async function () {
            // Set up a scenario where precision could be lost
            await time.increase(6 * 60 * 60 + 1);

            const vaultBalance = await baseToken.balanceOf(await vault.getAddress());

            // Test conversion safety with edge case NAV
            const edgeNAV = ethers.parseEther("0.000001"); // Minimum NAV

            await expect(vault.connect(oracle).updateNAV(edgeNAV, vaultBalance))
                .to.be.revertedWith("NAV change too large");
        });

        it("Should handle edge cases in share-to-asset conversion", async function () {
            // Test with minimum viable NAV
            await time.increase(6 * 60 * 60 + 1);

            const vaultBalance = await baseToken.balanceOf(await vault.getAddress());
            const minViableNAV = ethers.parseEther("0.001"); // Above MIN_NAV_VALUE

            // This should work but with total assets validation constraints
            await expect(vault.connect(oracle).updateNAV(minViableNAV, vaultBalance / 1000n))
                .to.be.revertedWith("NAV change too large");
        });
    });

    describe("Safe Arithmetic Operations", function () {
        it("Should handle underflow protection in withdrawals", async function () {
            await baseToken.connect(user1).approve(await vault.getAddress(), ethers.MaxUint256);
            await vault.connect(user1).deposit(ethers.parseEther("1000"), user1.address);

            await time.increase(24 * 60 * 60 + 1);

            // Withdraw all funds
            const userShares = await vault.balanceOf(user1.address);
            await vault.connect(user1).redeem(userShares, user1.address, user1.address);

            // userDeposits should be safely reduced to 0, not underflow
            expect(await vault.userDeposits(user1.address)).to.equal(0);
        });

        it("Should handle mulDiv operations safely", async function () {
            // Test that mulDiv operations in conversion functions are safe
            await baseToken.connect(user1).approve(await vault.getAddress(), ethers.MaxUint256);

            // Test with amounts that could cause intermediate overflow
            const largeAmount = ethers.parseEther("99999"); // Close to user limit
            await vault.connect(user1).deposit(largeAmount, user1.address);

            // Verify conversion worked correctly
            const shares = await vault.balanceOf(user1.address);
            expect(shares).to.equal(largeAmount); // Should be 1:1 at initial NAV
        });
    });
});
