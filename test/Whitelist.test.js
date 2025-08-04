const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");

describe("ERC4626YieldVault - Whitelist Functionality", function () {
    // Fixture for deploying contracts - simplified version
    async function deployVaultFixture() {
        const [deployer, admin, oracle, treasury, user1, user2, user3, unauthorized] = await ethers.getSigners();

        // Deploy base token
        const BaseToken = await ethers.getContractFactory("BaseToken");
        const baseToken = await upgrades.deployProxy(
            BaseToken,
            ["Base Token", "BT", deployer.address],
            { initializer: "initialize" }
        );

        // Deploy vault
        const ERC4626YieldVault = await ethers.getContractFactory("ERC4626YieldVault");
        const vault = await upgrades.deployProxy(
            ERC4626YieldVault,
            [
                await baseToken.getAddress(),
                "Yield Vault Token",
                "YVT",
                treasury.address,
                admin.address
            ],
            { initializer: "initialize", unsafeAllow: ["constructor"] }
        );

        // Grant roles
        const ORACLE_ROLE = await vault.ORACLE_ROLE();
        const TREASURY_ROLE = await vault.TREASURY_ROLE();
        await vault.connect(admin).grantRole(ORACLE_ROLE, oracle.address);
        await vault.connect(admin).grantRole(TREASURY_ROLE, treasury.address);

        // Setup token distribution
        const minterRole = await baseToken.MINTER_ROLE();
        await baseToken.connect(deployer).grantRole(minterRole, deployer.address);
        
        for (const user of [user1, user2, user3, unauthorized]) {
            await baseToken.mint(user.address, ethers.parseEther("10000"));
            await baseToken.connect(user).approve(await vault.getAddress(), ethers.parseEther("10000"));
        }

        return {
            vault,
            baseToken,
            deployer,
            admin,
            oracle,
            treasury,
            user1,
            user2,
            user3,
            unauthorized
        };
    }

    describe("Basic Whitelist Management", function () {
        it("Should initialize with whitelist disabled", async function () {
            const { vault } = await loadFixture(deployVaultFixture);
            expect(await vault.whitelistEnabled()).to.be.false;
        });

        it("Should allow admin to enable/disable whitelist", async function () {
            const { vault, admin } = await loadFixture(deployVaultFixture);
            
            await expect(vault.connect(admin).setWhitelistEnabled(true))
                .to.emit(vault, "WhitelistStatusChanged")
                .withArgs(true, admin.address);
                
            expect(await vault.whitelistEnabled()).to.be.true;
            
            await vault.connect(admin).setWhitelistEnabled(false);
            expect(await vault.whitelistEnabled()).to.be.false;
        });

        it("Should allow admin to add/remove addresses", async function () {
            const { vault, admin, user1 } = await loadFixture(deployVaultFixture);
            
            await expect(vault.connect(admin).addToWhitelist(user1.address))
                .to.emit(vault, "AddressWhitelisted")
                .withArgs(user1.address, admin.address);
                
            expect(await vault.isWhitelisted(user1.address)).to.be.true;
            
            await expect(vault.connect(admin).removeFromWhitelist(user1.address))
                .to.emit(vault, "AddressRemovedFromWhitelist")
                .withArgs(user1.address, admin.address);
                
            expect(await vault.isWhitelisted(user1.address)).to.be.false;
        });

        it("Should allow batch adding to whitelist", async function () {
            const { vault, admin, user1, user2, user3 } = await loadFixture(deployVaultFixture);
            
            const addresses = [user1.address, user2.address, user3.address];
            await vault.connect(admin).addMultipleToWhitelist(addresses);
            
            expect(await vault.isWhitelisted(user1.address)).to.be.true;
            expect(await vault.isWhitelisted(user2.address)).to.be.true;
            expect(await vault.isWhitelisted(user3.address)).to.be.true;
        });

        it("Should reject unauthorized whitelist management", async function () {
            const { vault, user1, user2 } = await loadFixture(deployVaultFixture);
            
            await expect(vault.connect(user1).setWhitelistEnabled(true))
                .to.be.reverted;
                
            await expect(vault.connect(user1).addToWhitelist(user2.address))
                .to.be.reverted;
        });
    });

    describe("Whitelist Access Control", function () {
        it("Should allow whitelisted users to deposit when enabled", async function () {
            const { vault, admin, user1 } = await loadFixture(deployVaultFixture);
            
            await vault.connect(admin).setWhitelistEnabled(true);
            await vault.connect(admin).addToWhitelist(user1.address);
            
            await expect(vault.connect(user1).deposit(ethers.parseEther("100"), user1.address))
                .to.not.be.reverted;
        });

        it("Should block non-whitelisted users when enabled", async function () {
            const { vault, admin, unauthorized } = await loadFixture(deployVaultFixture);
            
            await vault.connect(admin).setWhitelistEnabled(true);
            
            await expect(vault.connect(unauthorized).deposit(ethers.parseEther("100"), unauthorized.address))
                .to.be.revertedWithCustomError(vault, "WhitelistViolation")
                .withArgs(unauthorized.address, "account_not_whitelisted");
        });

        it("Should allow anyone when whitelist is disabled", async function () {
            const { vault, unauthorized } = await loadFixture(deployVaultFixture);
            
            // Whitelist disabled by default
            await expect(vault.connect(unauthorized).deposit(ethers.parseEther("100"), unauthorized.address))
                .to.not.be.reverted;
        });

        it("Should check receiver address for whitelist", async function () {
            const { vault, admin, user1, unauthorized } = await loadFixture(deployVaultFixture);
            
            await vault.connect(admin).setWhitelistEnabled(true);
            await vault.connect(admin).addToWhitelist(user1.address);
            
            // Can deposit for whitelisted receiver
            await expect(vault.connect(unauthorized).deposit(ethers.parseEther("100"), user1.address))
                .to.not.be.reverted;
                
            // Cannot deposit for non-whitelisted receiver
            await expect(vault.connect(unauthorized).deposit(ethers.parseEther("100"), unauthorized.address))
                .to.be.revertedWithCustomError(vault, "WhitelistViolation");
        });
    });

    describe("Integration with ERC4626 Functions", function () {
        it("Should integrate with maxDeposit correctly", async function () {
            const { vault, admin, user1, unauthorized } = await loadFixture(deployVaultFixture);
            
            await vault.connect(admin).setWhitelistEnabled(true);
            
            // Non-whitelisted should have 0 maxDeposit
            expect(await vault.maxDeposit(unauthorized.address)).to.equal(0);
            
            // Whitelisted should have normal maxDeposit
            await vault.connect(admin).addToWhitelist(user1.address);
            expect(await vault.maxDeposit(user1.address)).to.be.gt(0);
        });

        it("Should integrate with maxMint correctly", async function () {
            const { vault, admin, user1, unauthorized } = await loadFixture(deployVaultFixture);
            
            await vault.connect(admin).setWhitelistEnabled(true);
            
            // Non-whitelisted should have 0 maxMint
            expect(await vault.maxMint(unauthorized.address)).to.equal(0);
            
            // Whitelisted should have normal maxMint
            await vault.connect(admin).addToWhitelist(user1.address);
            expect(await vault.maxMint(user1.address)).to.be.gt(0);
        });

        it("Should work with canDeposit function", async function () {
            const { vault, admin, user1, unauthorized } = await loadFixture(deployVaultFixture);
            
            // Default state - anyone can deposit
            expect(await vault.canDeposit(unauthorized.address)).to.be.true;
            
            // Enable whitelist
            await vault.connect(admin).setWhitelistEnabled(true);
            expect(await vault.canDeposit(unauthorized.address)).to.be.false;
            
            // Add to whitelist
            await vault.connect(admin).addToWhitelist(user1.address);
            expect(await vault.canDeposit(user1.address)).to.be.true;
        });
    });

    describe("Edge Cases", function () {
        it("Should handle zero address validation", async function () {
            const { vault, admin } = await loadFixture(deployVaultFixture);
            
            await expect(vault.connect(admin).addToWhitelist(ethers.ZeroAddress))
                .to.be.revertedWith("Cannot whitelist zero address");
        });

        it("Should handle duplicate whitelist additions", async function () {
            const { vault, admin, user1 } = await loadFixture(deployVaultFixture);
            
            await vault.connect(admin).addToWhitelist(user1.address);
            
            await expect(vault.connect(admin).addToWhitelist(user1.address))
                .to.be.revertedWith("Address already whitelisted");
        });

        it("Should handle removing non-whitelisted address", async function () {
            const { vault, admin, user1 } = await loadFixture(deployVaultFixture);
            
            await expect(vault.connect(admin).removeFromWhitelist(user1.address))
                .to.be.revertedWith("Address not whitelisted");
        });

        it("Should not affect withdrawals", async function () {
            const { vault, admin, user1 } = await loadFixture(deployVaultFixture);
            
            // Deposit while whitelist disabled
            await vault.connect(user1).deposit(ethers.parseEther("100"), user1.address);
            
            // Enable whitelist without adding user
            await vault.connect(admin).setWhitelistEnabled(true);
            
            // Wait for withdrawal cooldown (24 hours)
            await ethers.provider.send("evm_increaseTime", [24 * 60 * 60 + 1]);
            await ethers.provider.send("evm_mine");
            
            // Should still be able to withdraw
            await expect(vault.connect(user1).withdraw(ethers.parseEther("50"), user1.address, user1.address))
                .to.not.be.reverted;
        });
    });
});
