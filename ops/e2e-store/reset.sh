#!/usr/bin/env bash
# Restore the store to its last snapshot (snapshot.sh): database and uploads.
# Run nightly at 03:17 by the com.kilbot.e2e-store-reset launchd agent, so a
# day's leftover probe records never pile up. Starts colima and the stack
# first if they are down.

# shellcheck source=lib.sh
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
take_store_lock

snapshot="$E2E_STORE_HOME/snapshot"
if [ ! -s "$snapshot/db.sql.gz" ] || [ ! -s "$snapshot/uploads.tar.gz" ]; then
	log "reset: no snapshot in $snapshot; run seed.sh then snapshot.sh"
	exit 1
fi

log "reset: $(date -u +%Y-%m-%dT%H:%M:%SZ) restoring $(sed -n 's/^taken_at=//p' "$snapshot/SNAPSHOT")"
"$E2E_STORE_OPS_DIR/start.sh"
wait_for_db

# The dump carries DROP/CREATE DATABASE, so this replaces the schema wholesale.
gunzip -c "$snapshot/db.sql.gz" | compose exec -T db mariadb -uroot -pe2e-store-root

restore="$E2E_STORE_HOME/data/.uploads-restore"
rm -rf "$restore"
mkdir -p "$restore"
tar -xzf "$snapshot/uploads.tar.gz" -C "$restore"
rsync -a --delete "$restore/uploads/" "$E2E_STORE_HOME/data/uploads/"
rm -rf "$restore"

# Object and opcache state from before the restore must not leak into it.
compose restart wordpress >/dev/null
# A snapshot taken before the test-only Pro licence flag existed lacks it.
if [ -d "$E2E_STORE_HOME/plugins/woocommerce-pos-pro" ]; then
	wp eval-file /e2e-ops/seed/pro-licence.php
fi
wp cache flush >/dev/null
log "reset: done"

# Re-assert the tailnet mapping: on 2026-10-17 another `tailscale serve
# --https=8443` (the house planner) silently replaced it and every E2E shard
# got a 404 on /wp-json. Idempotent; never fails the reset.
serve_target="http://127.0.0.1:$E2E_STORE_LOCAL_PORT"
serve_key="${E2E_STORE_URL#https://}"
serve_now="$(tailscale serve status --json 2>/dev/null |
	jq -r --arg k "$serve_key" '.Web[$k].Handlers["/"].Proxy // "none"' 2>/dev/null || echo unknown)"
if [ "$serve_now" = "$serve_target" ]; then
	log "reset: serve ok, $serve_key -> $serve_target"
elif sudo -n tailscale serve --bg --https=8443 "$serve_target" >/dev/null 2>&1; then
	log "reset: serve RESTORED, $serve_key was $serve_now, now $serve_target"
else
	log "reset: serve WRONG, $serve_key is $serve_now (want $serve_target), re-assert failed"
fi
