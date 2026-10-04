# Deploy to Databricks Apps

`app.yaml` runs `python scripts/run.py`, which binds to `DATABRICKS_APP_PORT` on all interfaces.
The root `package.json` builds the React frontend during deployment. `.env`, `node_modules/`,
`frontend/dist/` and `artifacts/` are in `.gitignore`, so they are never uploaded.

## One-time setup

```bash
brew trust databricks/tap && brew install databricks/tap/databricks
databricks auth login --host https://<your-workspace>.cloud.databricks.com
databricks secrets create-scope contradiction-lab
databricks secrets put-secret contradiction-lab anthropic-api-key   # paste the key when prompted
databricks apps create contradiction-lab
```

In the workspace UI, open **Compute → Apps → contradiction-lab → Edit → App resources**, add a
**Secret** resource (scope `contradiction-lab`, key `anthropic-api-key`, permission *Can read*), and
give it the resource key `anthropic-api-key`. `app.yaml` reads `ANTHROPIC_API_KEY` from it.

## Deploy (and redeploy after changes)

```bash
databricks sync . /Workspace/Users/<you>/contradiction-lab
databricks apps deploy contradiction-lab --source-code-path /Workspace/Users/<you>/contradiction-lab
```

## Limits of this deployment

- **Access:** Databricks Apps require a workspace login, so only workspace users can open the app.
  The app has no access control of its own: any of those users can start Claude runs billed to
  the configured key.
- **Storage:** investigations and uploaded PDFs are written to SQLite and files on the app's
  local disk. They are lost when the app restarts or is redeployed. The verified penguin record
  is re-seeded on every start.
- **Workers:** run a single process. The per-investigation locks live in memory; see
  `docs/ARCHITECTURE.md`.
