#!/usr/bin/env bash
# Snapshot the seeded store: database dump plus uploads, written to
# ~/e2e-store/snapshot (local only, never committed). reset.sh restores it.
# Take one after every seed.sh that changed something you want to keep.

# shellcheck source=lib.sh
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

snapshot="$E2E_STORE_HOME/snapshot"
tmp="$snapshot/.new"
rm -rf "$tmp"
mkdir -p "$tmp"

"$E2E_STORE_OPS_DIR/start.sh"
wait_for_db

compose exec -T db mariadb-dump -uroot -pe2e-store-root \
	--single-transaction --routines --triggers --add-drop-database --databases wordpress |
	gzip -6 >"$tmp/db.sql.gz"
tar -czf "$tmp/uploads.tar.gz" -C "$E2E_STORE_HOME/data" uploads
{
	printf 'taken_at=%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
	for marker in "$E2E_STORE_HOME"/plugins/*/.e2e-artefact; do
		[ -f "$marker" ] || continue
		printf '[%s]\n' "$(basename "$(dirname "$marker")")"
		cat "$marker"
	done
} >"$tmp/SNAPSHOT"

# Swap in the new snapshot only once it is complete.
mv "$tmp/db.sql.gz" "$tmp/uploads.tar.gz" "$tmp/SNAPSHOT" "$snapshot/"
rmdir "$tmp"
log "snapshot: $(du -h "$snapshot/db.sql.gz" | cut -f1) db, $(du -h "$snapshot/uploads.tar.gz" | cut -f1) uploads -> $snapshot"
