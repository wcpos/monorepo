#!/usr/bin/env bash
# Remove the E2E store from this machine.
#
#   uninstall.sh          unload the launchd agents, drop the :8443 tailnet
#                         listener, remove the containers and the e2e-store
#                         colima VM. Keeps ~/e2e-store (data, snapshot, plugins)
#                         and the keychain items.
#   uninstall.sh --purge  also delete ~/e2e-store and the wcpos-e2e-store
#                         keychain items.
#
# Touches nothing else: the `default` colima VM, the other `tailscale serve`
# entries and Funnel stay as they are.

# shellcheck source=lib.sh
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

purge=0
[ "${1:-}" = "--purge" ] && purge=1

for agent in com.kilbot.e2e-store-start com.kilbot.e2e-store-reset; do
	launchctl bootout "gui/$(id -u)/$agent" 2>/dev/null || true
	rm -f "$HOME/Library/LaunchAgents/$agent.plist"
	log "unloaded $agent"
done

tailscale serve --https=8443 off || true
log "tailscale serve: :8443 removed"

if colima_running; then
	compose down --remove-orphans || true
fi
colima delete --force "$E2E_COLIMA_PROFILE" || true
log "colima profile $E2E_COLIMA_PROFILE deleted"

if [ "$purge" = 1 ]; then
	for account in $(seq -f 'e2e-cashier-%g' 1 "$E2E_CASHIER_COUNT") e2e-product-writer e2e-admin; do
		security delete-generic-password -s "$E2E_KEYCHAIN_SERVICE" -a "$account" >/dev/null 2>&1 || true
	done
	log "keychain: $E2E_KEYCHAIN_SERVICE items deleted"
	# This script lives inside E2E_STORE_HOME; bash has already read it.
	rm -rf "$E2E_STORE_HOME"
	log "removed $E2E_STORE_HOME"
fi
