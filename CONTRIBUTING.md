# Contributing to sFDUSD Smart Contracts

Thank you for considering contributing to the sFDUSD Smart Contracts! This document provides guidelines for contributing to this project.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Process](#development-process)
- [Security Guidelines](#security-guidelines)
- [Testing Requirements](#testing-requirements)
- [Pull Request Process](#pull-request-process)
- [Coding Standards](#coding-standards)

## Code of Conduct

This project adheres to a code of conduct that we expect all contributors to follow. Please be respectful and professional in all interactions.

## Getting Started

1. **Fork the repository** and clone your fork
2. **Run the setup script**: `./setup.sh` (Linux/Mac) or `setup.bat` (Windows)
3. **Create a feature branch**: `git checkout -b feature/your-feature-name`
4. **Make your changes** following our guidelines
5. **Test thoroughly** including security tests
6. **Submit a pull request**

### Prerequisites

- Node.js 16+ 
- npm or yarn
- Git
- Basic understanding of Solidity and smart contract security

## Development Process

### Branching Strategy

- `main`: Production-ready code
- `develop`: Integration branch for features
- `feature/*`: Feature development branches
- `hotfix/*`: Critical bug fixes

### Commit Messages

Follow conventional commits format:

```
type(scope): description

[optional body]

[optional footer]
```

Types:
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `test`: Adding or updating tests
- `refactor`: Code refactoring
- `security`: Security improvements

Examples:
```
feat(vault): add emergency withdrawal function
fix(token): resolve precision loss in calculations
security(vault): implement flash loan protection
test(vault): add edge case coverage for deposits
```

## Security Guidelines

⚠️ **Security is paramount in smart contract development.** 

### Security Requirements

1. **All code changes must include security considerations**
2. **New features require comprehensive security tests**
3. **Follow established security patterns**
4. **Document potential security implications**

### Security Checklist

Before submitting code, ensure:

- [ ] No new reentrancy vulnerabilities
- [ ] Proper access control implementation
- [ ] Input validation and error handling
- [ ] Economic attack resistance
- [ ] Gas optimization without security compromise
- [ ] Emergency mechanisms remain functional

### Security Testing

Run the complete security test suite:

```bash
npm run test:security      # Core security tests
npm run test:penetration   # Advanced attack simulations
npm run test:edges         # Edge cases and boundary conditions
npm run test:all-security  # Complete security test suite
```

## Testing Requirements

### Test Coverage Standards

- **Minimum 95% line coverage** for all smart contracts
- **100% coverage** for critical functions (deposit, withdraw, emergency)
- **Security test coverage** for all attack vectors
- **Gas usage tests** for optimization verification

### Types of Tests Required

1. **Unit Tests**: Test individual functions and components
2. **Integration Tests**: Test contract interactions
3. **Security Tests**: Test against known attack patterns
4. **Edge Case Tests**: Test boundary conditions and extreme values
5. **Gas Tests**: Verify gas optimization

### Running Tests

```bash
# Run all tests
npm test

# Run specific test suites
npm run test:vault
npm run test:security
npm run test:coverage

# Run with gas reporting
npm run test:gas
```

## Pull Request Process

### Before Submitting

1. **Run all tests** and ensure they pass
2. **Run linting** and fix any issues: `npm run lint`
3. **Update documentation** if needed
4. **Add/update tests** for new functionality
5. **Run security tests** specifically
6. **Update CHANGELOG.md** with your changes

### PR Requirements

1. **Clear description** of changes and rationale
2. **Reference relevant issues** if applicable
3. **Include security impact assessment**
4. **All CI checks must pass**
5. **Code review approval** from maintainers
6. **Security review** for critical changes

### PR Template

```markdown
## Description
Brief description of changes

## Type of Change
- [ ] Bug fix
- [ ] New feature
- [ ] Breaking change
- [ ] Documentation update
- [ ] Security improvement

## Security Impact
Describe any security implications

## Testing
- [ ] All existing tests pass
- [ ] New tests added for new functionality
- [ ] Security tests pass
- [ ] Gas usage verified

## Checklist
- [ ] Code follows project standards
- [ ] Self-review completed
- [ ] Documentation updated
- [ ] CHANGELOG.md updated
```

## Coding Standards

### Solidity Style Guide

Follow the [official Solidity style guide](https://docs.soliditylang.org/en/latest/style-guide.html) with these additions:

#### File Structure
```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.21;

// Imports (grouped by source)
import "@openzeppelin/contracts/...";
import "./local/...";

/**
 * @title ContractName
 * @author 1st Digital
 * @notice Brief description
 * @dev Detailed technical description
 */
contract ContractName {
    // Type declarations
    // State variables
    // Events
    // Errors
    // Modifiers
    // Functions (grouped by visibility)
}
```

#### Naming Conventions
- **Contracts**: PascalCase (`YieldVault`)
- **Functions**: camelCase (`depositAssets`)
- **Variables**: camelCase (`totalAssets`)
- **Constants**: UPPER_SNAKE_CASE (`MAX_DEPOSIT_LIMIT`)
- **Events**: PascalCase (`AssetDeposited`)
- **Errors**: PascalCase with descriptive names (`InsufficientBalance`)

#### Documentation
- **NatSpec comments** for all public/external functions
- **Inline comments** for complex logic
- **Security notes** for critical sections

#### Security Patterns
- **Checks-Effects-Interactions** pattern
- **Reentrancy guards** on state-changing functions
- **Input validation** on all public functions
- **Access control** on privileged functions

### JavaScript/Testing Style

- Use **ESLint** configuration provided
- **Descriptive test names** explaining what is being tested
- **Group related tests** in describe blocks
- **Comment complex test logic**

### Git Practices

- **Atomic commits**: One logical change per commit
- **Descriptive commit messages**: Explain what and why
- **Small, focused PRs**: Easier to review and understand
- **Keep history clean**: Rebase when appropriate

## Documentation Standards

### Code Documentation

- **NatSpec comments** for all contracts and public functions
- **Inline comments** for complex business logic
- **Security warnings** for potentially dangerous operations

### README Updates

- Update feature lists when adding functionality
- Keep installation and usage instructions current
- Update examples when APIs change

### Architecture Documentation

- Document design decisions and rationale
- Update system architecture diagrams
- Maintain API documentation

## Release Process

### Version Numbering

Follow [Semantic Versioning](https://semver.org/):

- **MAJOR**: Breaking changes
- **MINOR**: New features (backward compatible)
- **PATCH**: Bug fixes (backward compatible)

### Release Checklist

- [ ] All tests pass
- [ ] Security audit completed (for major releases)
- [ ] Documentation updated
- [ ] CHANGELOG.md updated
- [ ] Version bumped appropriately
- [ ] Git tag created
- [ ] Release notes prepared

## Getting Help

### Resources

- [OpenZeppelin Documentation](https://docs.openzeppelin.com/)
- [Hardhat Documentation](https://hardhat.org/docs)
- [Solidity Documentation](https://docs.soliditylang.org/)

### Communication

- **GitHub Issues**: Bug reports and feature requests
- **GitHub Discussions**: General questions and discussions
- **Security Issues**: Follow responsible disclosure practices

### Support

For questions about contributing:

1. Check existing documentation
2. Search existing issues and discussions
3. Create a new issue with the `question` label

## Recognition

Contributors will be recognized in:

- Git commit history
- Release notes for significant contributions
- Project documentation

Thank you for contributing to sFDUSD Smart Contracts! 🚀
