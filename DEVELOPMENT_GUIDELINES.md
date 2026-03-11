# PulseCortex Platform Development Guidelines

## 1. Version Control & Source of Truth
- **All code changes MUST be committed and pushed** to the central Git repository (`main` branch).
- The Git repository is the absolute source of truth. Direct file modifications on the server without committing are strictly prohibited to prevent configuration drift.
- Commit messages should be clear and descriptive (e.g., `feat:`, `fix:`, `docs:`, `refactor:`).

## 2. Environments
- **Development (Current):** Changes are currently applied and tested on the primary VM environment.
- **Production (Planned):** A separate, isolated production environment will be established. 
- Deployment to Production will exclusively occur via the CI/CD pipeline pulling from the Git repository. Manual file drops into Production will be blocked.

## 3. CI/CD Pipeline
- Deployments are triggered via GitHub Webhooks.
- When code is pushed to `main`, the webhook listener pulls the latest changes (`git pull`) and executes `deploy.sh`.
- Do not bypass `deploy.sh` for system updates (like restarting SystemD services or updating database schemas). If the deployment process changes, update `deploy.sh` and push the change.

## 4. Environment Variables & Secrets
- Never commit `.env` files or hardcoded credentials (API keys, JWT secrets, database passwords) to the repository.
- Use `.env.example` templates to document required variables.
- Secrets must be injected securely at runtime via SystemD environment files or a secure vault.

## 5. Architectural Standards
- The backend runs on Node.js (Express) managed by SystemD (`pulsecortex-backend.service`).
- All internal API routing must go through standard port bindings (e.g., Port `3000`).
- Any new services added to the platform must include a health check endpoint (`/health`) for monitoring.