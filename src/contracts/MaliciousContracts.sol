// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title MaliciousReentrancy
 * @dev A test contract to simulate reentrancy attacks for security testing
 * This contract should NEVER be used in production
 */
contract MaliciousReentrancy {
    address public vault;
    IERC20 public token;
    bool public attacking = false;
    uint256 public attackCount = 0;

    constructor(address _vault, address _token) {
        vault = _vault;
        token = IERC20(_token);
    }

    // This function would be called by the vault during withdrawal
    // It tries to reenter the vault's withdraw function
    fallback() external payable {
        if (attacking && attackCount < 3) {
            attackCount++;
            // Try to call vault functions again
            (bool success, ) = vault.call(
                abi.encodeWithSignature("withdraw(uint256)", 100)
            );
            // Ignore success/failure for test purposes
        }
    }

    function startAttack() external {
        attacking = true;
        attackCount = 0;

        // Approve and deposit
        token.approve(vault, type(uint256).max);
        (bool success, ) = vault.call(
            abi.encodeWithSignature("deposit(uint256)", 1000 * 10 ** 18)
        );
        require(success, "Deposit failed");
    }

    function attemptWithdraw(uint256 amount) external {
        attacking = true;
        (bool success, ) = vault.call(
            abi.encodeWithSignature("withdraw(uint256)", amount)
        );
        attacking = false;
    }
}

/**
 * @title MaliciousUpgrade
 * @dev A test contract to simulate malicious upgrade attempts
 */
contract MaliciousUpgrade {
    mapping(address => uint256) public balances;
    address public owner;

    constructor() {
        owner = msg.sender;
    }

    // Malicious function that tries to steal funds
    function drain() external {
        require(msg.sender == owner, "Not owner");
        payable(owner).transfer(address(this).balance);
    }

    // Fake the original interface
    function balanceOf(address account) external view returns (uint256) {
        return balances[account];
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        // Malicious: steal tokens
        balances[msg.sender] = 0;
        balances[owner] += amount;
        return true;
    }
}

/**
 * @title FlashLoanAttacker
 * @dev Simulates flash loan attacks
 */
contract FlashLoanAttacker {
    address public vault;
    IERC20 public token;

    constructor(address _vault, address _token) {
        vault = _vault;
        token = IERC20(_token);
    }

    function executeFlashLoanAttack(uint256 amount) external {
        // Simulate receiving flash loan
        // 1. Use flash loaned tokens to make large deposit
        token.approve(vault, amount);

        (bool success1, ) = vault.call(
            abi.encodeWithSignature("deposit(uint256)", amount)
        );
        require(success1, "Deposit failed");

        // 2. Try to immediately withdraw (should fail due to cooldown)
        (bool success2, bytes memory data) = vault.call(
            abi.encodeWithSignature("balanceOf(address)", address(this))
        );
        require(success2, "Balance check failed");

        uint256 shares = abi.decode(data, (uint256));

        (bool success3, ) = vault.call(
            abi.encodeWithSignature("withdraw(uint256)", shares)
        );
        // This should fail due to cooldown period

        // 3. Try to repay flash loan (would fail in real scenario)
    }
}
