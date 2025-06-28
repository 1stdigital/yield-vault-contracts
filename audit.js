#!/usr/bin/env node

/**
 * Comprehensive Security Audit Script for sFDUSD Yield Vault
 * 
 * This script performs various security checks and analysis
 */

const fs = require('fs');
const path = require('path');

console.log('🔍 sFDUSD Yield Vault Security Audit');
console.log('=====================================\n');

// Check for known vulnerability patterns
function checkVulnerabilityPatterns(contractCode) {
    const issues = [];

    // Check for reentrancy protection
    if (!contractCode.includes('nonReentrant')) {
        issues.push({
            severity: 'HIGH',
            type: 'Reentrancy',
            description: 'Contract may be vulnerable to reentrancy attacks'
        });
    }

    // Check for access control
    if (!contractCode.includes('onlyRole') && !contractCode.includes('require(msg.sender')) {
        issues.push({
            severity: 'HIGH',
            type: 'Access Control',
            description: 'No access control mechanisms detected'
        });
    }

    // Check for integer overflow protection (should use Solidity 0.8+)
    const solidityVersion = contractCode.match(/pragma solidity ([0-9.]+);/);
    if (solidityVersion && solidityVersion[1] < '0.8.0') {
        issues.push({
            severity: 'MEDIUM',
            type: 'Integer Overflow',
            description: 'Using Solidity version without built-in overflow protection'
        });
    }

    // Check for unchecked external calls
    const externalCalls = contractCode.match(/\.[a-zA-Z]+\([^)]*\)(?!\s*;)/g);
    if (externalCalls) {
        issues.push({
            severity: 'MEDIUM',
            type: 'Unchecked External Calls',
            description: 'External calls should have return value checks',
            details: `Found ${externalCalls.length} potential external calls`
        });
    }

    // Check for tx.origin usage
    if (contractCode.includes('tx.origin')) {
        issues.push({
            severity: 'HIGH',
            type: 'tx.origin Usage',
            description: 'tx.origin should not be used for authorization'
        });
    }

    // Check for block.timestamp dependency
    if (contractCode.includes('block.timestamp') || contractCode.includes('now')) {
        issues.push({
            severity: 'LOW',
            type: 'Timestamp Dependency',
            description: 'Contract relies on block timestamp which can be manipulated by miners'
        });
    }

    return issues;
}

// Analyze smart contract code
function analyzeContract(filePath) {
    console.log(`📄 Analyzing: ${path.basename(filePath)}`);
    console.log('─'.repeat(50));

    const contractCode = fs.readFileSync(filePath, 'utf8');
    const issues = checkVulnerabilityPatterns(contractCode);

    if (issues.length === 0) {
        console.log('✅ No obvious vulnerability patterns detected');
    } else {
        issues.forEach(issue => {
            console.log(`⚠️  ${issue.severity}: ${issue.type}`);
            console.log(`   ${issue.description}`);
            if (issue.details) {
                console.log(`   ${issue.details}`);
            }
        });
    }

    // Contract-specific checks
    if (filePath.includes('ERC4626YieldVault.sol')) {
        console.log('\n🔍 ERC4626 Specific Checks:');

        // Check for proper ERC4626 implementation
        const erc4626Functions = [
            'deposit', 'withdraw', 'mint', 'redeem',
            'convertToShares', 'convertToAssets',
            'maxDeposit', 'maxMint', 'maxWithdraw', 'maxRedeem'
        ];

        erc4626Functions.forEach(func => {
            if (contractCode.includes(func)) {
                console.log(`✅ Implements ${func}`);
            } else {
                console.log(`❌ Missing ${func}`);
            }
        });

        // Check for vault-specific security measures
        if (contractCode.includes('cooldown')) {
            console.log('✅ Implements withdrawal cooldown');
        }

        if (contractCode.includes('maxDeposit')) {
            console.log('✅ Implements deposit limits');
        }

        if (contractCode.includes('NAV')) {
            console.log('✅ Implements NAV management');
        }
    }

    console.log('\n');
}

// Main audit execution
try {
    const contractsDir = './src/contracts';
    const contractFiles = fs.readdirSync(contractsDir)
        .filter(file => file.endsWith('.sol'))
        .map(file => path.join(contractsDir, file));

    contractFiles.forEach(analyzeContract);

    // Check package.json for dependency issues
    console.log('📦 Dependency Analysis');
    console.log('─'.repeat(50));

    const packageJson = JSON.parse(fs.readFileSync('./package.json', 'utf8'));
    const ozVersion = packageJson.dependencies['@openzeppelin/contracts'];
    const ozUpgradeableVersion = packageJson.dependencies['@openzeppelin/contracts-upgradeable'];

    console.log(`OpenZeppelin Contracts: ${ozVersion}`);
    console.log(`OpenZeppelin Upgradeable: ${ozUpgradeableVersion}`);

    // Check for known vulnerable versions
    if (ozVersion === '^4.9.4' || ozUpgradeableVersion === '^4.9.4') {
        console.log('⚠️  WARNING: Using OpenZeppelin 4.9.4 which has a known Multicall vulnerability (CVE-2023-49798)');
        console.log('   Recommendation: Upgrade to 4.9.5 or later');
    } else if (ozVersion === '^4.9.3' || ozUpgradeableVersion === '^4.9.3') {
        console.log('✅ Using OpenZeppelin 4.9.3 - No known critical vulnerabilities');
    }

    console.log('\n✅ Audit completed');

} catch (error) {
    console.error('❌ Audit failed:', error.message);
    process.exit(1);
}
