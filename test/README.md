# Test Suite for ERC4626YieldVault

This directory contains comprehensive tests for the ERC4626 Yield Vault smart contracts.

## Test Structure

### Main Test Files

- **`ERC4626YieldVault.test.js`** - Core functionality tests including ERC4626 compliance, access control, and basic operations
- **`Security.test.js`** - Comprehensive security tests covering reentrancy, flash loans, access control attacks, and economic manipulations
- **`GasOptimization.test.js`** - Gas usage analysis and optimization verification tests
- **`EdgeCases.test.js`** - Edge cases, boundary conditions, and complex integration scenarios

### Helper Files

- **`helpers/TestHelpers.js`** - Utility functions and test setup helpers

## Running Tests

### Run All Tests
```bash
npm test
```

### Run Specific Test Suites
```bash
# Core functionality tests
npm run test:main

# Security-focused tests
npm run test:security

# Gas optimization tests
npm run test:gas

# Edge cases and integration tests
npm run test:edge
```

### Run Tests with Coverage
```bash
npm run test:coverage
```

### Run Tests in Parallel
```bash
npm run test:all
```

## Test Categories

### 1. Core ERC4626 Functionality
- Deployment and initialization
- Deposit and mint operations
- Withdraw and redeem operations
- Share/asset calculations
- ERC4626 compliance verification

### 2. Security Tests
- **Reentrancy Protection**: Tests against reentrancy attacks on all state-changing functions
- **Flash Loan Protection**: Verification of cooldown mechanisms and withdrawal delays
- **Access Control**: Tests for role-based permissions and unauthorized access prevention
- **Economic Attacks**: MEV resistance, front-running protection, and NAV manipulation prevention
- **Upgrade Security**: Verification of secure upgrade mechanisms

### 3. Business Logic
- NAV (Net Asset Value) management and oracle updates
- Withdrawal cooldown enforcement
- Deposit limits (per-user and total)
- Reserve ratio enforcement
- Treasury operations

### 4. Administrative Functions
- Role management and access control
- Parameter updates (cooldowns, limits, ratios)
- Emergency operations (pause/unpause, batch withdrawals)
- Treasury withdrawals with reserve protection

### 5. Gas Optimization
- Gas usage measurement for common operations
- Optimization verification and regression testing
- Batch operation efficiency testing

### 6. Edge Cases
- Precision and rounding edge cases
- Multi-user interaction scenarios
- State transition edge cases
- Boundary value testing
- External contract integration

## Test Environment Setup

Each test file sets up a complete environment including:

1. **Contracts Deployed**:
   - ERC4626YieldVault (main contract)
   - BaseToken (test asset token)
   - MockERC20 (alternative test token)
   - TestContract (external interaction testing)
   - MaliciousReentrancy (reentrancy attack simulation)
   - FlashLoanAttacker (flash loan attack simulation)
   - MaliciousUpgrade (upgrade attack simulation)

2. **Roles Configured**:
   - DEFAULT_ADMIN_ROLE
   - ORACLE_ROLE
   - TREASURY_ROLE
   - PAUSER_ROLE
   - UPGRADER_ROLE

3. **Test Data**:
   - Multiple user accounts with funded balances
   - Various deposit amounts and scenarios
   - Time-based testing with block advancement

## Key Test Scenarios

### Security-Critical Tests

1. **Reentrancy Attack Prevention**
   - Tests that malicious contracts cannot reenter during withdrawals
   - Verifies ReentrancyGuard effectiveness

2. **Flash Loan Attack Prevention**
   - Tests that large deposits cannot be immediately withdrawn
   - Verifies cooldown mechanism effectiveness

3. **Economic Manipulation Prevention**
   - NAV change limits enforcement
   - Reserve ratio protection
   - Front-running protection via withdrawal delays

### Operational Tests

1. **Normal User Workflows**
   - Complete deposit-wait-withdraw cycles
   - Multi-user scenarios with varying amounts
   - NAV changes affecting user returns

2. **Administrative Operations**
   - Oracle NAV updates within limits
   - Treasury withdrawals respecting reserves
   - Emergency batch operations

3. **Edge Conditions**
   - Very small (1 wei) and very large deposits
   - Boundary testing for all limits
   - Precision handling in calculations

## Gas Benchmarks

The gas optimization tests establish benchmarks for:

- **Deposits**: < 200k gas for first deposit, < 150k for subsequent
- **Withdrawals**: < 300k gas including all checks
- **NAV Updates**: < 100k gas
- **Administrative Operations**: < 150k gas

## Contributing to Tests

When adding new functionality:

1. **Add corresponding tests** in the appropriate test file
2. **Include security tests** for any new attack vectors
3. **Add gas optimization tests** for new operations
4. **Update edge case tests** for new boundary conditions
5. **Use TestHelpers** for common setup and utility functions

### Test Naming Convention

- Describe **what** is being tested
- Include **expected behavior**
- Use **"Should"** format for readability

Example:
```javascript
it("Should prevent reentrancy attacks on deposit", async function () {
  // Test implementation
});
```

### Security Test Requirements

All new features must include tests for:
- Input validation
- Access control
- Reentrancy protection
- Economic attack resistance
- Gas limit considerations

## Test Coverage Goals

- **Minimum 95% line coverage** for all smart contracts
- **100% coverage** for critical functions (deposit, withdraw, emergency operations)
- **Complete security test coverage** for all identified attack vectors
- **Gas optimization verification** for all operations

## Running in CI/CD

These tests are designed to run in continuous integration environments:

```bash
# Install dependencies
npm install

# Compile contracts
npm run build

# Run full test suite
npm run test:all

# Generate coverage report
npm run test:coverage
```

## Debugging Tests

For debugging failed tests:

1. **Use descriptive test names** to identify failing scenarios
2. **Check gas usage** in gas optimization tests
3. **Verify time advancement** in cooldown-related tests
4. **Confirm role setup** in access control tests
5. **Review event emissions** for state change verification
