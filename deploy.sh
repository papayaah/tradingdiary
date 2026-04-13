#!/usr/bin/env bash
set -euo pipefail
IFS=$'\n\t'

# Load local deployment configuration
CONFIG_FILE="$(dirname "${BASH_SOURCE[0]}")/.env.deploy"
if [[ -f "$CONFIG_FILE" ]]; then
  set -o allexport
  # shellcheck source=/dev/null
  source "$CONFIG_FILE"
  set +o allexport
else
  echo "Error: Missing $CONFIG_FILE. Please create it from template." >&2
  exit 1
fi

# Validation: ensure required variables are set
REQUIRED_VARS=(SSH_KEY_PATH SERVER_IP SSH_USER APP_NAME APP_PORT DOMAIN)
for var in "${REQUIRED_VARS[@]}"; do
  if [[ -z "${!var:-}" ]]; then
    echo "Error: Required variable '$var' is not set in $CONFIG_FILE." >&2
    exit 1
  fi
done

DRY_RUN="false"

usage() {
  cat <<EOF
Usage: ./deploy.sh [options]
Options:
  --dry-run   Print actions without executing
  -h, --help  Show help
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run) DRY_RUN="true" ; shift 1 ;;
    -h|--help) usage ; exit 0 ;;
    *) echo "Unknown argument: $1" >&2 ; usage >&2 ; exit 2 ;;
  esac
done

expand_tilde() {
  local p="$1"
  [[ "$p" == "~/"* ]] && printf '%s\n' "${HOME}/${p:2}" || printf '%s\n' "$p"
}

SSH_KEY_PATH="$(expand_tilde "$SSH_KEY_PATH")"
REMOTE_HOST="${SSH_USER}@${SERVER_IP}"
REMOTE_BASE="/srv/${APP_NAME}"
REMOTE_ENV="${REMOTE_BASE}/.env"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

ssh_cmd() {
  ssh -i "$SSH_KEY_PATH" -o StrictHostKeyChecking=accept-new "$REMOTE_HOST" "$@"
}

run() {
  if [[ "$DRY_RUN" == "true" ]]; then
    printf '[dry-run] %s\n' "$*" >&2
    return 0
  fi
  eval "$@"
}

echo "Deploying ${APP_NAME} to ${SERVER_IP} (${DOMAIN})"
echo "Port: ${APP_PORT}, Dir: ${REMOTE_BASE}"
echo

# 1. Build locally
echo "Building components locally..."
npm run build

# 2. Prepare remote directory
echo "Syncing code to server..."
run "ssh_cmd \"mkdir -p '$REMOTE_BASE'\""

# 3. Sync code (excluding artifacts/vcs)
run "rsync -az --delete \
  -e \"ssh -i '$SSH_KEY_PATH' -o StrictHostKeyChecking=accept-new\" \
  --exclude '.git/' \
  --exclude 'node_modules/' \
  --exclude '.next/' \
  --exclude 'docs/' \
  --exclude '.DS_Store' \
  --exclude '.env' \
  --exclude '.env.local' \
  \"$ROOT_DIR/\" \"$REMOTE_HOST:$REMOTE_BASE/\""

# 4. Starting containers
echo "Starting containers on server (docker compose up -d --build)..."
run "ssh_cmd \"cd '$REMOTE_BASE' && docker compose up -d --build\""

# 6. Optional: Nginx setup check (Informational)
echo
echo "Done. Ensure Nginx is configured on the server to proxy ${DOMAIN} to port ${APP_PORT}."
echo "You can check /etc/nginx/sites-available/${APP_NAME}.conf on the server."
echo "URL: http://${DOMAIN}"
