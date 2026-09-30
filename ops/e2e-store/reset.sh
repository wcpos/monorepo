#!/usr/bin/env bash
# Restore the store to its last snapshot (snapshot.sh): database and uploads.
# Run nightly at 03:17 by the com.kilbot.e2e-store-reset launchd agent, so a
# day's leftover probe records never pile up. Starts colima and the stack
# first if they are down.

# shellcheck source=lib.sh
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

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
wp cache flush >/dev/null
log "reset: done"
