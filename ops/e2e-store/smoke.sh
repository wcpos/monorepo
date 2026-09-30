#!/usr/bin/env bash
# Smoke checks for the E2E store:
#   1. wcpos/v2/site answers over the tailnet URL (run on the mini);
#   2. the same URL is NOT reachable from the internet: the name's public DNS
#      (Funnel relays, since Funnel is on for :443) and the mini's public IP are
#      both tried on :8443 with `curl --resolve`, and both must fail;
#   3. a WCPOS login round-trip with a cashier through /wcpos-auth, the route the
#      app opens, then the cashier API with the issued bearer token.
#
# Step 3 logs in as E2E_SMOKE_USER with E2E_SMOKE_PASS when both are set
# (seed.sh does this right after generating the cashier password). Otherwise it
# creates a throwaway cashier with a random password and deletes it afterwards,
# so it never needs the keychain. No password or token is ever printed.

# shellcheck source=lib.sh
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

host="$(printf '%s' "$E2E_STORE_URL" | sed -E 's#^https://([^:/]+).*#\1#')"
port=8443
site_path="/wp-json/wcpos/v2/site"
failures=0
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

pass() { printf 'PASS  %s\n' "$*"; }
fail() {
	printf 'FAIL  %s\n' "$*"
	failures=$((failures + 1))
}

# 1. Reachable on the tailnet.
if curl -sf -o "$tmp/site.json" "$E2E_STORE_URL$site_path"; then
	pass "tailnet: GET $E2E_STORE_URL$site_path -> $(jq -c '{wcpos_version: (.wcpos_version // .version // null), keys: (keys | length)}' "$tmp/site.json" 2>/dev/null || echo 'non-JSON body')"
else
	fail "tailnet: GET $E2E_STORE_URL$site_path"
fi

# 2. Not reachable from the internet.
public_targets=()
while read -r ip; do
	[ -n "$ip" ] && public_targets+=("$ip")
done < <(dig +short @1.1.1.1 "$host" A | grep -E '^[0-9.]+$' || true)
public_ip="$(curl -sf --max-time 10 https://api.ipify.org || true)"
[ -n "$public_ip" ] && public_targets+=("$public_ip")
if [ "${#public_targets[@]}" -eq 0 ]; then
	fail "public: no public address to test against (DNS and ipify both empty)"
fi
for ip in ${public_targets[@]+"${public_targets[@]}"}; do
	if curl -s -o /dev/null --max-time 15 --resolve "$host:$port:$ip" "https://$host:$port$site_path"; then
		code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 --resolve "$host:$port:$ip" "https://$host:$port$site_path" || true)"
		fail "public: https://$host:$port via $ip answered (HTTP $code)"
	else
		pass "public: https://$host:$port via $ip does not connect"
	fi
done

# 3. Cashier login round-trip.
throwaway=""
user="${E2E_SMOKE_USER:-}"
if [ -z "$user" ] || [ -z "${E2E_SMOKE_PASS:-}" ]; then
	user="e2e-smoke-$(openssl rand -hex 3)"
	E2E_SMOKE_PASS="$(openssl rand -base64 24 | tr -d '/+=')"
	export E2E_SMOKE_PASS
	compose run --rm --no-deps -T -e E2E_SMOKE_PASS wpcli wp eval-file /e2e-ops/seed/smoke-user.php create "$user" >/dev/null
	throwaway="$user"
fi

state="smoke$(openssl rand -hex 8)"
redirect_uri="https://e2e-smoke.invalid/callback"
auth_url="$E2E_STORE_URL/wcpos-auth?redirect_uri=$(jq -rn --arg v "$redirect_uri" '$v|@uri')&state=$state"
curl -sf -o "$tmp/auth.html" "$auth_url" || : >"$tmp/auth.html"
nonce="$(sed -nE 's/.*name="_wpnonce" value="([^"]+)".*/\1/p' "$tmp/auth.html" | head -n 1)"
auth_session="$(sed -nE 's/.*name="auth_session" value="([^"]*)".*/\1/p' "$tmp/auth.html" | head -n 1)"
if [ -z "$nonce" ]; then
	fail "login: /wcpos-auth did not render the login form"
else
	location="$(printf '%s' "$E2E_SMOKE_PASS" | curl -s -o /dev/null -w '%{redirect_url}' \
		--data-urlencode "wcpos-log=$user" --data-urlencode "wcpos-pwd@-" \
		--data-urlencode "_wpnonce=$nonce" --data-urlencode "auth_session=$auth_session" \
		--data-urlencode "wcpos_website=" --data-urlencode "wcpos-submit=Log In" \
		"$auth_url")"
	token="$(printf '%s' "$location" | sed -nE 's/.*[?&]access_token=([^&]+).*/\1/p')"
	user_id="$(printf '%s' "$location" | sed -nE 's/.*[?&]id=([0-9]+).*/\1/p')"
	if [ "${location%%\?*}" != "$redirect_uri" ] || [ -z "$token" ] || [ -z "$user_id" ]; then
		fail "login: POST /wcpos-auth as $user did not redirect with tokens"
	else
		pass "login: POST /wcpos-auth as $user -> redirect to the app with access and refresh tokens (user #$user_id)"
		code="$(printf 'Authorization: Bearer %s\n' "$token" | curl -s -o "$tmp/cashier.json" -w '%{http_code}' \
			-H @- "$E2E_STORE_URL/wp-json/wcpos/v1/cashier/$user_id")"
		if [ "$code" = 200 ]; then
			pass "login: GET wcpos/v1/cashier/$user_id with the bearer token -> 200 $(jq -c '{id, username: (.username // null), stores: ((.stores // []) | length)}' "$tmp/cashier.json" 2>/dev/null)"
			# With Pro active, the seed's three stores must reach the cashier
			# (the test-only licence flag, README); the default store alone
			# means the flag is missing and the pro multi-store specs are blind.
			if wp plugin is-active woocommerce-pos-pro >/dev/null 2>&1; then
				stores="$(jq '(.stores // []) | length' "$tmp/cashier.json" 2>/dev/null || echo 0)"
				if [ "$stores" -ge 3 ]; then
					pass "stores: Pro active, the cashier API lists $stores stores"
				else
					fail "stores: Pro active, but the cashier API lists $stores store(s), not 3 or more (is the test-only licence flag set?)"
				fi
			fi
		else
			fail "login: GET wcpos/v1/cashier/$user_id with the bearer token -> HTTP $code"
		fi
	fi
fi

if [ -n "$throwaway" ]; then
	compose run --rm --no-deps -T wpcli wp eval-file /e2e-ops/seed/smoke-user.php delete "$throwaway" >/dev/null
fi

if [ "$failures" -gt 0 ]; then
	echo "smoke: $failures check(s) failed"
	exit 1
fi
echo "smoke: all checks passed"
