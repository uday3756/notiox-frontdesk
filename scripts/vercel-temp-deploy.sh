#!/usr/bin/env bash
# One-off agent deploy: loads .env, sets URLs from deployment host, redeploys with runtime env.
set -euo pipefail
cd "$(dirname "$0")/.."

if [[ ! -f .env ]]; then
  echo "Missing .env" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1091
source .env
set +a

echo "Phase 1: initial temporary deploy…"
OUT1=$(npx vercel deploy --temporary --yes 2>&1)
echo "$OUT1" | tail -20

HOST=$(echo "$OUT1" | rg -o 'https://[a-z0-9-]+\.tmp\.now' | head -1)
if [[ -z "$HOST" ]]; then
  HOST=$(echo "$OUT1" | rg -o '"url": "https://[^"]+"' | head -1 | sed 's/.*"\(https[^"]*\)".*/\1/')
fi
if [[ -z "$HOST" ]]; then
  echo "Could not parse deployment URL" >&2
  exit 1
fi

HOST_ONLY="${HOST#https://}"
echo "Using host: $HOST"

export VITE_APP_URL="$HOST"
export APP_URL="$HOST"
export APP_HOST="$HOST_ONLY"
export ALLOWED_HOSTS="$HOST_ONLY"
export SUPABASE_AUTH_REDIRECT_URL="${HOST}/auth/callback"
export NODE_ENV=production

SESSION="${SESSION_SECRET:-$(openssl rand -hex 32)}"
export SESSION_SECRET="$SESSION"

# Build-time + runtime flags from .env (quote-safe; no logging of values)
ENV_ARGS=()
while IFS= read -r line || [[ -n "$line" ]]; do
  [[ -z "$line" || "$line" =~ ^[[:space:]]*# ]] && continue
  key="${line%%=*}"
  val="${line#*=}"
  case "$key" in
    VITE_*|SUPABASE_*|APP_*|ALLOWED_HOSTS|NOTIOX_*|SESSION_SECRET|NODE_ENV)
      ENV_ARGS+=(--build-env "${key}=${val}")
      ENV_ARGS+=(--env "${key}=${val}")
      ;;
  esac
done < .env
# URL overrides after reading .env
ENV_ARGS+=(--build-env "VITE_APP_URL=${HOST}")
ENV_ARGS+=(--env "VITE_APP_URL=${HOST}")
ENV_ARGS+=(--build-env "APP_URL=${HOST}")
ENV_ARGS+=(--env "APP_URL=${HOST}")
ENV_ARGS+=(--build-env "APP_HOST=${HOST_ONLY}")
ENV_ARGS+=(--env "APP_HOST=${HOST_ONLY}")
ENV_ARGS+=(--build-env "ALLOWED_HOSTS=${HOST_ONLY}")
ENV_ARGS+=(--env "ALLOWED_HOSTS=${HOST_ONLY}")
ENV_ARGS+=(--build-env "SUPABASE_AUTH_REDIRECT_URL=${HOST}/auth/callback")
ENV_ARGS+=(--env "SUPABASE_AUTH_REDIRECT_URL=${HOST}/auth/callback")
ENV_ARGS+=(--build-env "NODE_ENV=production")
ENV_ARGS+=(--env "NODE_ENV=production")
ENV_ARGS+=(--build-env "SESSION_SECRET=${SESSION}")
ENV_ARGS+=(--env "SESSION_SECRET=${SESSION}")

echo "Phase 2: deploy with env (${#ENV_ARGS[@]} flags)…"
OUT2=$(npx vercel deploy --temporary --yes "${ENV_ARGS[@]}" 2>&1)
echo "$OUT2" | tail -25

URL=$(echo "$OUT2" | rg -o 'https://[a-z0-9-]+\.tmp\.now' | head -1)
CLAIM=$(echo "$OUT2" | rg -o 'https://vercel.com/claim-deployment\?code=[a-f0-9-]+' | head -1)
echo "DEPLOY_URL=$URL"
echo "CLAIM_URL=$CLAIM"
