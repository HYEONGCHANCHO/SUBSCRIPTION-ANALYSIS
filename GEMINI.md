# Project Mandates

All tasks performed in this workspace must adhere to the specialized configurations and guidelines defined below.

## 🚀 에이전트 작업 지침 (Agentic Workflow & Token Efficiency)
이 프로젝트에서 코드를 수정하거나 기능을 개선할 때, 에이전트(Gemini CLI)는 다음의 토큰 최적화 및 모듈화 원칙을 최우선으로 준수해야 합니다.

1. **지능적 캐싱(Context Caching):** 고정된 설정(예: 사용자 프로필, 청약 조건)과 누적된 대화 맥락(예: 임대주택 보증금 규칙)은 `backend/src/utils/context-manager.js`와 같은 지능형 캐시를 통해 관리됩니다. 에이전트는 파일의 전체 내용을 매번 읽지 말고(read_file 최소화), 캐시 매니저를 통해 맥락을 주입받아 분석 작업을 수행해야 합니다.
2. **서브 에이전트 위임(Sub-agent Delegation):** 방대한 리팩토링이나 시스템 전반의 오류 탐색은 `codebase_investigator`나 `generalist` 같은 전문 서브 에이전트에게 위임하여 메인 컨텍스트 윈도우의 토큰 소모를 방지하세요.
3. **타겟형 수정(Surgical Edits):** 전체 코드를 덮어쓰지 말고, `grep_search`로 정확한 위치를 파악한 뒤 `replace` 도구를 사용하여 변경이 필요한 부분만 정확히 수정하세요.
4. **모듈 분리(Modularization):** 단일 스크립트(`auto-run.sh` 등)에 모든 기능(수집, 분석, 전송)을 몰아넣지 마세요. 스크래핑(Scraper), 분석(Analyzer), 보고(Reporter)를 독립된 모듈로 분리하여 유지보수성을 극대화해야 합니다.

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

