# Project Instructions

## Shared Development Workspace

- Secret management module:
  - Java SDK and primary working directory (`env-vault-client`): `E:\Java\Projects\env-vault-client`
  - Backend (`env-vault`, Go): `E:\goland\env-vault`
  - Frontend (`env-vault-web`, Vue): `E:\Projects\vue\env-vault-web`
- Publishing module:
  - Backend (`publish-devops-api`): `/Users/vincent/IdeaProjects/efficient-platform/publish-devops-api`
  - Frontend (`devops-frontend`): `/Users/vincent/Desktop/codes.nosync/devops-frontend`
- A request to modify the publishing frontend targets `devops-frontend`; a request to modify the secret management frontend targets `env-vault-web`.
- For Env Vault work, use `env-vault-client` as the default coordinating repository unless the request clearly targets the backend or frontend.
- For every Env Vault requirement, first determine whether it affects the Java SDK, Go backend, Vue frontend, or multiple repositories. API contract or user-flow changes must be checked across all affected repositories.
- Follow each repository's local instructions and run the relevant validation in every repository changed.
- Do not assume the repositories share the same parent directory; use the paths above when moving between them.

## Frontend Rules

- Read and follow `AGENT.md` in this directory before making frontend changes.
