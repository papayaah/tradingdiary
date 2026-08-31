#!/usr/bin/env bash
#
# db:pull — mirror a user's FULL trading dataset from the production database
# into your LOCAL database so you can develop against real trades. Prod is
# read-only; only your local DB (and .env.local) is written.
#
#   - Reads SSH config from .env.deploy and the local DB from .env.local.
#   - Reaches prod Postgres via `ssh + docker compose exec` (no exposed port).
#   - Heals schema drift: adds any columns prod has that local is missing.
#   - Maps prod owners to your local user BY EMAIL (never copies auth rows, so it
#     can't create duplicate users). Table uuids are copied verbatim, so all
#     cross-table foreign keys stay valid; only text user_id is remapped.
#   - Mirrors: accounts, executions, trade groups (+ memberships), cash flows,
#     notes, tags, AI reviews, attachments, the IBKR Flex connection, and the
#     watchlist tables the scanner reads.
#   - Syncs IBKR_FLEX_ENCRYPTION_KEY from prod into .env.local so the copied
#     (encrypted) Flex token decrypts locally.
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
  ssh -i "$KEY" -o StrictHostKeyChecking=accept-new -o BatchMode=yes "$REMOTE" \
    "cd /srv/$APP && set -a; . ./.env 2>/dev/null; set +a; docker compose exec -T postgres psql -U \"\${POSTGRES_USER:-tradingdiary}\" -d \"\${POSTGRES_DB:-tradingdiary}\" -tA" 2>/dev/null <<SQL
$1
SQL
}
# Data-only dump of the given tables from prod, in one FK-safe pass.
prod_dump() {
  ssh -i "$KEY" -o StrictHostKeyChecking=accept-new -o BatchMode=yes "$REMOTE" \
    "cd /srv/$APP && set -a; . ./.env 2>/dev/null; set +a; docker compose exec -T postgres pg_dump -U \"\${POSTGRES_USER:-tradingdiary}\" -d \"\${POSTGRES_DB:-tradingdiary}\" --data-only --column-inserts --on-conflict-do-nothing $*" 2>/dev/null
}
# Read one env var's full line from prod .env (value never printed).
prod_env_line() {
  ssh -i "$KEY" -o StrictHostKeyChecking=accept-new -o BatchMode=yes "$REMOTE" \
    "grep -m1 '^$1=' /srv/$APP/.env" 2>/dev/null || true
}
loc() { "$PSQL" "$LOCAL_URL" -v ON_ERROR_STOP=1 "$@"; }

# All per-user data tables, ordered PARENT → CHILD so inserts satisfy foreign
# keys. trade_group_execution and trade_tag are join tables (no user_id).
TABLES=(
  trading_account
  tag
  execution
  trade_group
  cash_flow
  daily_note
  attachment
  trade_group_execution
  trade_note
  trade_tag
  trade_ai_review
  ibkr_flex_connection
  user_watchlists
  server_watch
  server_watch_state
)

# Deleting these (CHILD → PARENT here, but each cascades) clears a user's data:
# trading_account cascades executions/groups/memberships/notes/cash flows; tag
# cascades trade_tag; the rest are independent roots.
DELETE_ROOTS=(trading_account tag attachment ibkr_flex_connection server_watch user_watchlists)

echo "==> db:pull — mirroring FULL trading data from prod (${SERVER_IP}) into local"

# 1) Schema-heal: add any columns prod has that local is missing (best effort).
for t in "${TABLES[@]}"; do
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

# 3) Dump all tables (one FK-ordered pass) and remap owner ids to local ids.
DUMP_ARGS=(); for t in "${TABLES[@]}"; do DUMP_ARGS+=(-t "$t"); done
echo "   . dumping $(IFS=,; echo "${TABLES[*]}") from prod…"
prod_dump "${DUMP_ARGS[@]}" > "$TMP/data.sql"
sed "${SED_ARGS[@]}" "$TMP/data.sql" > "$TMP/data.remapped.sql"

# 4) Mirror into local in one transaction: delete these users' rows (cascades
#    clear children), then load prod's set (parents first from the ordered dump).
{
  echo "BEGIN;"
  for lid in "${LOCAL_IDS[@]}"; do
    for root in "${DELETE_ROOTS[@]}"; do
      echo "DELETE FROM \"$root\" WHERE user_id='$lid';"
    done
  done
  cat "$TMP/data.remapped.sql"
  echo "COMMIT;"
} > "$TMP/load.sql"
loc -f "$TMP/load.sql" >/dev/null
echo "   = data loaded"

# 5) Sync the Flex token encryption key so the copied encrypted token decrypts.
KEYLINE="$(prod_env_line IBKR_FLEX_ENCRYPTION_KEY)"
if [ -n "$KEYLINE" ]; then
  grep -v '^IBKR_FLEX_ENCRYPTION_KEY=' .env.local > "$TMP/env.local" || true
  printf '%s\n' "$KEYLINE" >> "$TMP/env.local"
  cp "$TMP/env.local" .env.local
  echo "   = IBKR_FLEX_ENCRYPTION_KEY synced into .env.local"
else
  echo "   ! IBKR_FLEX_ENCRYPTION_KEY not found in prod .env — the copied Flex token will not decrypt"
fi

# 6) Report.
for lid in "${LOCAL_IDS[@]}"; do
  ex="$(loc -tAc "SELECT count(*) FROM execution WHERE user_id='$lid'")"
  tg="$(loc -tAc "SELECT count(*) FROM trade_group WHERE user_id='$lid'")"
  ac="$(loc -tAc "SELECT count(*) FROM trading_account WHERE user_id='$lid'")"
  fx="$(loc -tAc "SELECT count(*) FROM ibkr_flex_connection WHERE user_id='$lid'")"
  sw="$(loc -tAc "SELECT count(*) FROM server_watch WHERE user_id='$lid'")"
  echo "   = local user ${lid}: ${ac} accounts, ${ex} executions, ${tg} trade groups, ${fx} flex connection, ${sw} server_watch"
done
echo "==> Done. Your local DB now mirrors prod for the matched user(s)."
