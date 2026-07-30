#!/usr/bin/env bash
#
# db:pull — copy watchlist DATA from the production database into your LOCAL
# database so you can develop against the same stocks. Prod is read-only; only
# your local DB is written.
#
#   - Reads SSH config from .env.deploy and the local DB from .env.local.
#   - Reaches prod Postgres via `ssh + docker compose exec` (no exposed port).
#   - Heals schema drift: adds any columns prod has that local is missing.
#   - Maps the prod owner to your local user BY EMAIL (never copies auth rows,
#     so it can't create duplicate users/accounts), then mirrors their watches.
#
# NOTE: this is a DATA sync. It is unrelated to `drizzle-kit push/pull`, which
# sync table STRUCTURE (see db:schema:push / db:schema:pull).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

[ -f .env.deploy ] || { echo "Missing .env.deploy (SSH config)"; exit 1; }
[ -f .env.local ]  || { echo "Missing .env.local (local DATABASE_URL)"; exit 1; }

set -a; source .env.deploy; set +a
KEY="${SSH_KEY_PATH/#\~/$HOME}"
REMOTE="${SSH_USER}@${SERVER_IP}"
APP="${APP_NAME:-tradingdiary}"
PSQL="$(command -v psql || echo /opt/homebrew/opt/libpq/bin/psql)"
LOCAL_URL="$(grep -E '^DATABASE_URL=' .env.local | head -1 | cut -d= -f2- | tr -d '"')"
[ -n "$LOCAL_URL" ] || { echo "No DATABASE_URL in .env.local"; exit 1; }

# Safety rail: this script only ever writes to a LOCAL database. Refuse anything
# that doesn't clearly point at localhost so a misconfigured env can't hit prod.
case "$LOCAL_URL" in
  *localhost*|*127.0.0.1*) : ;;
  *) echo "Refusing: DATABASE_URL is not local ($LOCAL_URL). db:pull only writes to a local DB."; exit 1 ;;
esac

TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT

# Run SQL on prod via stdin (avoids nested ssh/docker/psql quoting).
prod_sql() {
  ssh -i "$KEY" -o StrictHostKeyChecking=accept-new "$REMOTE" \
    "cd /srv/$APP && set -a; . ./.env 2>/dev/null; set +a; docker compose exec -T postgres psql -U \"\${POSTGRES_USER:-tradingdiary}\" -d \"\${POSTGRES_DB:-tradingdiary}\" -tA" <<SQL
$1
SQL
}
# Data-only dump of the given tables from prod.
prod_dump() {
  ssh -i "$KEY" -o StrictHostKeyChecking=accept-new "$REMOTE" \
    "cd /srv/$APP && set -a; . ./.env 2>/dev/null; set +a; docker compose exec -T postgres pg_dump -U \"\${POSTGRES_USER:-tradingdiary}\" -d \"\${POSTGRES_DB:-tradingdiary}\" --data-only --column-inserts --on-conflict-do-nothing $*"
}
loc() { "$PSQL" "$LOCAL_URL" -v ON_ERROR_STOP=1 "$@"; }

TABLES="server_watch server_watch_state"
echo "==> db:pull — syncing watchlist data from prod (${SERVER_IP}) into local"

# 1) Schema-heal: add any columns prod has that local is missing.
for t in $TABLES; do
  while IFS='|' read -r name typ; do
    [ -z "$name" ] && continue
    has="$(loc -tAc "SELECT 1 FROM information_schema.columns WHERE table_name='$t' AND column_name='$name'")"
    if [ -z "$has" ]; then
      echo "   + adding missing column ${t}.${name} (${typ})"
      loc -c "ALTER TABLE \"$t\" ADD COLUMN IF NOT EXISTS \"$name\" $typ"
    fi
  done < <(prod_sql "SELECT column_name||'|'||data_type FROM information_schema.columns WHERE table_name='$t'")
done

# 2) Map prod owners -> local users by email. Never copy user/account rows.
LOCAL_IDS=(); SED_ARGS=()
while IFS='|' read -r pid email; do
  [ -z "${email:-}" ] && continue
  lid="$(loc -tAc "SELECT id FROM \"user\" WHERE email='$email' LIMIT 1")"
  if [ -z "$lid" ]; then
    echo "   ! no local user for ${email} — log in locally once as that account, then re-run. Skipping."
    continue
  fi
  echo "   . ${email}: prod ${pid} -> local ${lid}"
  LOCAL_IDS+=("$lid"); SED_ARGS+=(-e "s/${pid}/${lid}/g")
done < <(prod_sql "SELECT id||'|'||coalesce(email,'') FROM \"user\"")

[ ${#LOCAL_IDS[@]} -gt 0 ] || { echo "No prod owner matched a local user. Nothing to sync."; exit 1; }

# 3) Dump prod data and remap owner ids to the matching local ids.
prod_dump -t server_watch -t server_watch_state > "$TMP/data.sql"
sed "${SED_ARGS[@]}" "$TMP/data.sql" > "$TMP/data.remapped.sql"

# 4) Mirror into local in one transaction: delete these users' rows (state
#    cascades via FK), then load prod's current set.
{
  echo "BEGIN;"
  for lid in "${LOCAL_IDS[@]}"; do echo "DELETE FROM server_watch WHERE user_id='$lid';"; done
  cat "$TMP/data.remapped.sql"
  echo "COMMIT;"
} > "$TMP/load.sql"
loc -f "$TMP/load.sql" >/dev/null

# 5) Report.
for lid in "${LOCAL_IDS[@]}"; do
  cnt="$(loc -tAc "SELECT count(*) FROM server_watch WHERE user_id='$lid'")"
  echo "   = local user ${lid}: ${cnt} watches"
done
echo "==> Done. Your local DB now mirrors prod's watchlist."
