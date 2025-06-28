---
mode: agent
---
Analyze this workspace and create or update `.github/copilot-instructions.md` with actionable guidance for future AI coding agents.

**Focus on guidance principles, not implementation inventory:**

### Core Guidance Areas:
- **Development Approach**: How to work with this codebase (commands, workflows, setup patterns)
- **Architecture Principles**: How to structure and organize code (patterns to follow, not what exists)
- **Code Standards**: What rules to follow for style, naming, imports, error handling
- **Decision Framework**: When to use which technologies, patterns, or approaches
- **Quality Gates**: How to ensure code quality (testing approach, validation patterns)

### Key Principles:
- **Prescriptive over Descriptive**: Tell agents "use X pattern" not "we have X files"
- **Guidance over Inventory**: Focus on "how to approach building" not "what's currently built"
- **Principles over Specifics**: Emphasize patterns and rules that stay relevant as code evolves
- **Context over Details**: Provide enough context to make good decisions, not exhaustive documentation

### Sources to Consider:
- Existing agent rules (`.cursor/**`, `.cursorrules`, `AGENTS.md`, etc.)
- Package.json scripts for workflow understanding
- Architecture docs for high-level patterns
- README for project context and setup approach

### Guidelines:
- **Patch/merge** existing `.github/copilot-instructions.md` - never overwrite
- **Be concise** - focus on actionable rules and principles
- **Future-proof** - emphasize approaches that work as the project grows
- **Cite facts** from the repo, but frame them as guidance patterns

## Key Improvements Over Original Prompt

### ❌ Original Focus (What Not To Do):
- Documenting current implementation details
- Creating exhaustive file listings
- Describing what exists in the codebase
- Technical inventory of packages and services

### ✅ Improved Focus (What To Do):
- **"How to approach"** instead of **"what exists"**
- **"Patterns to follow"** instead of **"current implementation"**
- **"Guidance principles"** instead of **"technical inventory"**
- **"Decision framework"** instead of **"feature documentation"**

## Benefits

1. **Future-Proof**: Instructions remain valuable as the project evolves
2. **Actionable**: Agents know what to do, not just what's there
3. **Consistent**: Promotes consistent approaches across development
4. **Maintainable**: Less likely to become outdated documentation
5. **Decision-Focused**: Helps agents make good architectural choices

## Example Comparison

### ❌ Implementation-Focused (Avoid):
```markdown
## Current Architecture
- We have a .NET 8 API with the following endpoints:
  - GET /api/health - Health checks
  - GET /api/test/ping - Connection testing
- Frontend uses Angular 20+ with these components:
  - DashboardComponent in /features/dashboard/
  - VaultListComponent in /features/vaults/
```

### ✅ Guidance-Focused (Prefer):
```markdown
## Backend Development (.NET 8)
- Use minimal APIs for simple endpoints, controllers for complex logic
- Implement health checks and basic test endpoints early
- Follow Entity Framework Core patterns for data access
- Add integration tests for critical paths

## Frontend Development (Angular)
- Use @1stdigital/ng-sdk components consistently (prefixed `fdt-`)
- Structure around vault-centric navigation
- Use reactive forms with proper validation
```

This approach creates instructions that guide decision-making rather than document current state.
