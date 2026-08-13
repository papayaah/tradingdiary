#!/usr/bin/env bash
set -euo pipefail

env_file="${1:-}"
if [[ -z "$env_file" || ! -f "$env_file" ]]; then
  echo "Error: Production environment file is missing: ${env_file:-<not provided>}" >&2
  exit 1
fi

auth_secret="$(sed -n 's/^BETTER_AUTH_SECRET=//p' "$env_file" | tail -n 1)"
auth_secret="${auth_secret%\"}"
auth_secret="${auth_secret#\"}"
auth_secret="${auth_secret%\'}"
auth_secret="${auth_secret#\'}"

if (( ${#auth_secret} < 32 )); then
  echo "Error: BETTER_AUTH_SECRET must contain at least 32 characters." >&2
  exit 1
fi

unique_characters="$(printf '%s' "$auth_secret" | fold -w1 | LC_ALL=C sort -u | wc -l | tr -d ' ')"
if ! awk -v secret_length="${#auth_secret}" -v unique="$unique_characters" \
  'BEGIN { exit !((secret_length * log(unique) / log(2)) >= 120) }'; then
  echo "Error: BETTER_AUTH_SECRET has less than 120 bits of estimated entropy." >&2
  echo "Generate one with: npx auth@latest secret (or: openssl rand -base64 32)" >&2
  exit 1
fi

echo "Production authentication secret passed length and entropy checks."
