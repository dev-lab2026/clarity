#!/usr/bin/env bash
set -euo pipefail
BASE_URL="${BASE_URL:-http://127.0.0.1:3000}"
EMAIL="${LOCAL_ADMIN_EMAIL:-admin@local}"
PASSWORD="${LOCAL_ADMIN_PASSWORD:-}"
TEST_EMAIL="${TEST_EMAIL:-crud-test-$(date +%s)@local.test}"
COOKIE_FILE="$(mktemp)"
LOGIN_FILE="$(mktemp)"
trap 'rm -f "$COOKIE_FILE" "$LOGIN_FILE"' EXIT
[[ -n "$PASSWORD" ]] || { echo "LOCAL_ADMIN_PASSWORD est requis." >&2; exit 1; }
json_success(){ python3 -c 'import json,sys; x=json.loads(sys.argv[1]); assert x.get("success") is True, x.get("error","Operation echouee")' "$1"; }
json_field(){ python3 -c 'import json,sys; x=json.loads(sys.argv[1]); print(x[sys.argv[2].split(".")[0]] if "." not in sys.argv[2] else x[sys.argv[2].split(".")[0]][sys.argv[2].split(".")[1]])' "$1" "$2"; }

echo '[1/6] Health check'
curl -fsS "$BASE_URL/api/health" >/dev/null

echo '[2/6] Login administrateur'
LOGIN_BODY=$(EMAIL="$EMAIL" PASSWORD="$PASSWORD" python3 -c 'import json,os; print(json.dumps({"email":os.environ["EMAIL"],"password":os.environ["PASSWORD"]}))')
curl -fsS -c "$COOKIE_FILE" -X POST "$BASE_URL/api/auth/login-password" -H 'Content-Type: application/json' -d "$LOGIN_BODY" > "$LOGIN_FILE"
python3 -c 'import json; x=json.load(open("'$LOGIN_FILE'")); assert x.get("success") is True, x'

echo '[3/6] CREATE'
CREATE_BODY=$(TEST_EMAIL="$TEST_EMAIL" python3 -c 'import json,os; print(json.dumps({"email":os.environ["TEST_EMAIL"],"displayName":"CRUD Test User","role":"CONTRIBUTEUR","jobTitle":"Test","department":"QA","isActive":True}))')
CREATE=$(curl -fsS -b "$COOKIE_FILE" -X POST "$BASE_URL/api/admin/users" -H 'Content-Type: application/json' -d "$CREATE_BODY")
json_success "$CREATE"
USER_ID=$(json_field "$CREATE" 'user.id')
echo "    created: $USER_ID"

echo '[4/6] READ + UPDATE'
READ=$(curl -fsS -b "$COOKIE_FILE" "$BASE_URL/api/admin/users")
USER_ID="$USER_ID" READ="$READ" python3 -c 'import json,os; x=json.loads(os.environ["READ"]); uid=os.environ["USER_ID"]; assert any(u["id"]==uid for u in x.get("users",[])), "Profil absent de la liste"'
UPDATE=$(curl -fsS -b "$COOKIE_FILE" -X PUT "$BASE_URL/api/admin/users/$USER_ID" -H 'Content-Type: application/json' -d '{"displayName":"CRUD Test Updated","role":"PMO","department":"PMO"}')
json_success "$UPDATE"

echo '[5/6] DISABLE + ENABLE'
for state in false true; do
  STATUS=$(curl -fsS -b "$COOKIE_FILE" -X PATCH "$BASE_URL/api/admin/users/$USER_ID/status" -H 'Content-Type: application/json' -d "{\"isActive\":$state}")
  json_success "$STATUS"
done

echo '[6/6] DELETE'
DELETE=$(curl -fsS -b "$COOKIE_FILE" -X DELETE "$BASE_URL/api/admin/users/$USER_ID")
json_success "$DELETE"
echo 'CRUD PROFILS: OK'
