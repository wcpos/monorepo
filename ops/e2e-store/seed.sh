#!/usr/bin/env bash
# Seed the E2E store. Idempotent: safe to re-run, and re-running after
# fetch-plugins.sh has found a woocommerce-pos-pro artefact activates Pro and
# creates the three WCPOS stores without rebuilding anything.
#
#   seed.sh                     install/activate, settings, taxes, catalogue, users
#   seed.sh --rotate-passwords  also regenerate every E2E password (then update
#                               the GitHub secrets from the keychain)
#
# Generated passwords go straight from memory into WordPress (through the
# container environment, never argv) and the login keychain, service
# wcpos-e2e-store, one item per username. They are never printed or written
# to a file. A password is generated only for a group that lacks one, so an
# ordinary re-run leaves the keychain and the GitHub secrets valid.

# shellcheck source=lib.sh
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

rotate=0
case "${1:-}" in
	--rotate-passwords) rotate=1 ;;
	"") ;;
	*)
		echo "usage: $0 [--rotate-passwords]" >&2
		exit 64
		;;
esac

"$E2E_STORE_OPS_DIR/start.sh"
[ -d "$E2E_STORE_HOME/plugins/woocommerce-pos" ] || "$E2E_STORE_OPS_DIR/fetch-plugins.sh"
[ -s "$E2E_STORE_HOME/catalogue/products.json" ] || "$E2E_STORE_OPS_DIR/fetch-catalogue.sh"

generate_password() {
	openssl rand -base64 36 | tr -d '/+=\n' | cut -c1-32
}

store_in_keychain() {
	local account="$1" password="$2"
	security add-generic-password -U -s "$E2E_KEYCHAIN_SERVICE" -a "$account" \
		-l "$E2E_KEYCHAIN_SERVICE $account" -w "$password"
	log "keychain: $E2E_KEYCHAIN_SERVICE / $account"
}

# 1. WordPress core. The install-time admin password is random and discarded;
#    users.php gives e2e-admin its real, keychained one below.
if ! wp core is-installed >/dev/null 2>&1; then
	log "installing WordPress"
	wp core install --url="$E2E_STORE_URL" --title="WCPOS E2E store (next)" \
		--admin_user=e2e-admin --admin_email=e2e-admin@example.test \
		--admin_password="$(generate_password)" --skip-email
fi
wp rewrite structure '/%postname%/' >/dev/null

# 2. Plugins: whatever fetch-plugins.sh installed. Pro is optional until its
#    repo publishes a `next` deployment-package artefact.
plugins=(woocommerce woocommerce-pos)
if [ -d "$E2E_STORE_HOME/plugins/woocommerce-pos-pro" ]; then
	plugins+=(woocommerce-pos-pro)
else
	log "woocommerce-pos-pro not present; seeding free only"
fi
wp plugin activate "${plugins[@]}"

# 3. Settings, tax rates, the suite's tax-class fixtures, catalogue.
wp eval-file /e2e-ops/seed/settings.php --user=e2e-admin
wp eval-file /e2e-scripts/tax-class-fixtures.php --user=e2e-admin
wp eval-file /e2e-ops/seed/catalogue.php --user=e2e-admin

# 4. Users. Only groups without a password get one (all of them on --rotate).
status="$(wp eval-file /e2e-ops/seed/users.php status)"
needs() { [ "$rotate" = 1 ] || grep -qx "$1=needs-password" <<<"$status"; }
env_args=()
if needs cashiers; then
	E2E_CASHIER_PASS="$(generate_password)"
	export E2E_CASHIER_PASS
	env_args+=(-e E2E_CASHIER_PASS)
fi
if needs writer; then
	E2E_WRITER_PASS="$(generate_password)"
	export E2E_WRITER_PASS
	env_args+=(-e E2E_WRITER_PASS)
fi
if needs admin; then
	E2E_ADMIN_PASS="$(generate_password)"
	export E2E_ADMIN_PASS
	env_args+=(-e E2E_ADMIN_PASS)
fi
compose run --rm --no-deps -T ${env_args[@]+"${env_args[@]}"} wpcli wp eval-file /e2e-ops/seed/users.php apply
if [ -n "${E2E_CASHIER_PASS:-}" ]; then
	for i in $(seq 1 "$E2E_CASHIER_COUNT"); do
		store_in_keychain "e2e-cashier-$i" "$E2E_CASHIER_PASS"
	done
fi
[ -z "${E2E_WRITER_PASS:-}" ] || store_in_keychain e2e-product-writer "$E2E_WRITER_PASS"
[ -z "${E2E_ADMIN_PASS:-}" ] || store_in_keychain e2e-admin "$E2E_ADMIN_PASS"

# 5. Coupons, and the three WCPOS stores when Pro is active.
wp eval-file /e2e-ops/seed/extras.php --user=e2e-admin

wp rewrite flush >/dev/null
wp cache flush >/dev/null
wp eval-file /e2e-ops/seed/summary.php

# 6. With a cashier password in hand, prove a real cashier can log in.
if [ -n "${E2E_CASHIER_PASS:-}" ]; then
	E2E_SMOKE_USER=e2e-cashier-1 E2E_SMOKE_PASS="$E2E_CASHIER_PASS" "$E2E_STORE_OPS_DIR/smoke.sh"
fi
log "seeded. Next: $E2E_STORE_OPS_DIR/snapshot.sh"
