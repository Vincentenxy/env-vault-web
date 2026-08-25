# Project Instructions

## Shared Development Workspace

- Secret management module:
  - Backend (`env-vault`): `/Users/vincent/GolandProjects/env-vault`
  - Frontend (`env-vault-web`): `/Users/vincent/Desktop/codes.nosync/env-vault-web`
- Publishing module:
  - Backend (`publish-devops-api`): `/Users/vincent/IdeaProjects/efficient-platform/publish-devops-api`
  - Frontend (`devops-frontend`): `/Users/vincent/Desktop/codes.nosync/devops-frontend`
- A request to modify the publishing frontend targets `devops-frontend`; a request to modify the secret management frontend targets `env-vault-web`.
- For every requirement, first determine whether it affects a module's backend, frontend, or both. API contract or user-flow changes must be checked across the corresponding pair.
- Follow each repository's local instructions and run the relevant validation in every repository changed.
- Do not assume the repositories share the same parent directory; use the paths above when moving between them.

## Frontend Rules

- Read and follow `AGENT.md` in this directory before making frontend changes.
