#!/usr/bin/env bash
# Production smoke: API readiness, login, and frontend.
# Exit 0 only if all checks pass. Safe to run from Actions or locally (bash/Git Bash).
set -euo pipefail

API_BASE="${SMOKE_API_BASE:-https://stockyard-api-xvaa.onrender.com}"
FRONTEND_URL="${SMOKE_FRONTEND_URL:-https://stockyard-phi.vercel.app}"
SMOKE_USER="${SMOKE_USER:-CO01A-1}"
SMOKE_PASS="${SMOKE_PASS:-CO01A}"
RETRIES="${SMOKE_RETRIES:-8}"
RETRY_SLEEP="${SMOKE_RETRY_SLEEP:-15}"

red() { printf '✗ %s\n' "$*" >&2; }
ok() { printf '✓ %s\n' "$*"; }

check_ready() {
  local body code
  body="$(curl -fsS --max-time 20 "${API_BASE}/ready")" || return 1
  code="$(printf '%s' "$body" | grep -o '"status":"[^"]*"' | head -1 || true)"
  if [[ "$body" != *'"status":"ready"'* ]]; then
    red "/ready unexpected body: $body"
    return 1
  fi
  ok "/ready → $body"
}

check_login() {
  local body
  body="$(curl -fsS --max-time 20 \
    -X POST "${API_BASE}/api/auth/login" \
    -H "Content-Type: application/json" \
    -d "{\"username\":\"${SMOKE_USER}\",\"password\":\"${SMOKE_PASS}\"}")" || return 1
  if [[ "$body" != *'"success":true'* ]] || [[ "$body" != *'"token":'* ]]; then
    red "login failed: $body"
    return 1
  fi
  ok "login ${SMOKE_USER} → token ok"
}

check_frontend() {
  local code
  code="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 20 "${FRONTEND_URL}/")" || return 1
  if [[ "$code" != "200" ]]; then
    red "frontend ${FRONTEND_URL} → HTTP $code"
    return 1
  fi
  ok "frontend ${FRONTEND_URL} → HTTP $code"
}

with_retries() {
  local name="$1"
  shift
  local i=1
  until "$@"; do
    if (( i >= RETRIES )); then
      red "${name} failed after ${RETRIES} attempts"
      return 1
    fi
    printf '… %s attempt %s/%s failed; retry in %ss\n' "$name" "$i" "$RETRIES" "$RETRY_SLEEP"
    sleep "$RETRY_SLEEP"
    i=$((i + 1))
  done
}

echo "Smoke against API=${API_BASE} FE=${FRONTEND_URL}"
with_retries ready check_ready
with_retries login check_login
with_retries frontend check_frontend
echo "All smoke checks passed."
