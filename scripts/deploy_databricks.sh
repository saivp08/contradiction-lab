#!/usr/bin/env bash
# Deploy Contradiction Lab to Databricks Apps. Run `databricks auth login --host <workspace-url>` first.
# Idempotent: rerun it to redeploy after code changes.
set -euo pipefail
cd "$(dirname "$0")/.."

APP=contradiction-lab
SCOPE=contradiction-lab
SECRET=anthropic-api-key

user=$(databricks current-user me -o json | python3 -c 'import json, sys; print(json.load(sys.stdin)["userName"])')
remote="/Workspace/Users/$user/$APP"

if ! databricks secrets list-scopes -o json | python3 -c "import json, sys; sys.exit(0 if any(s['name'] == '$SCOPE' for s in json.load(sys.stdin) or []) else 1)"; then
  databricks secrets create-scope "$SCOPE"
fi

# The key goes from .env to Databricks through a private temp file, never argv or stdout.
payload=$(mktemp)
chmod 600 "$payload"
trap 'rm -f "$payload"' EXIT
python3 - "$payload" "$SCOPE" "$SECRET" <<'PY'
import json, sys
from pathlib import Path
path, scope, key = sys.argv[1:]
values = dict(line.split("=", 1) for line in Path(".env").read_text().splitlines() if "=" in line and not line.startswith("#"))
token = values.get("ANTHROPIC_API_KEY", "").strip().strip('"')
if not token:
    sys.exit("ANTHROPIC_API_KEY is empty in .env")
Path(path).write_text(json.dumps({"scope": scope, "key": key, "string_value": token}))
PY
databricks secrets put-secret --json "@$payload"
rm -f "$payload"

resources='[{"name": "anthropic-api-key", "secret": {"scope": "'"$SCOPE"'", "key": "'"$SECRET"'", "permission": "READ"}}]'
if databricks apps get "$APP" >/dev/null 2>&1; then
  databricks apps update "$APP" --json '{"name": "'"$APP"'", "resources": '"$resources"'}' >/dev/null
else
  databricks apps create --json '{"name": "'"$APP"'", "resources": '"$resources"'}'
fi

databricks sync . "$remote"
databricks apps deploy "$APP" --source-code-path "$remote"
databricks apps get "$APP" -o json | python3 -c 'import json, sys; print("App URL:", json.load(sys.stdin).get("url"))'
