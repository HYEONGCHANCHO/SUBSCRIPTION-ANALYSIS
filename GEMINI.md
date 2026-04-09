# Project Mandates

All tasks performed in this workspace must adhere to the specialized configurations and guidelines defined in the following directories:

- **Agents:** `.gemini/agents/*.md`
- **Skills:** `.gemini/skills/*.md`

Refer to these files as foundational context for implementation, design, and code quality. Prioritize the standards and workflows defined there to ensure consistency and high quality across the project.

# Engineering Standards Addendum

## Automation & CI/CD (GitHub Actions)
- **Node.js Version:** Always use **Node.js 24** or higher for GitHub Actions to avoid deprecation issues. Set `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24: true` in the global `env`.
- **Path Portability:** NEVER use absolute paths (e.g., `/Users/...`). Always use relative paths (`./`) or dynamic path resolution (`process.cwd()`, `dirname $0`) to ensure scripts work in both local and CI environments.
- **Permission Management:** Workflows that need to push data back to the repository MUST explicitly declare `permissions: contents: write`.
- **Security & Secrets:** Never hardcode API keys, Webhook URLs, or OAuth tokens. Use GitHub Secrets and bridge them via `.env` files within the runner.
- **YAML Integrity:** Avoid using automated string replacement (`sed`) for structural changes in YAML files. Manually verify indentation and nesting levels.
- **Data Persistence:** Ensure `.gitignore` does not block critical analysis results that need to be committed back to the repository during automation.

