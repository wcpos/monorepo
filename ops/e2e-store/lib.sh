# shellcheck shell=bash disable=SC2034 # settings here are read by the scripts that source this file
# Shared settings for the ops/e2e-store scripts. Sourced, never executed.
#
# Everything stateful lives under E2E_STORE_HOME (~/e2e-store by default), never
# in this repo: plugins, database and uploads, snapshots, logs, seed inputs.

set -euo pipefail

E2E_STORE_HOME="${E2E_STORE_HOME:-$HOME/e2e-store}"
E2E_STORE_OPS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# The store is published on the tailnet by `tailscale serve --https=8443`, which
# terminates TLS and proxies to nginx on this loopback-only port.
E2E_STORE_URL="${E2E_STORE_URL:-https://claudes-mac-mini.tail6a20e3.ts.net:8443}"
E2E_STORE_LOCAL_PORT="${E2E_STORE_LOCAL_PORT:-18443}"

# A colima profile of its own, so the `default` VM other work uses is never
# resized or restarted by the store. 4 CPU / 4 GiB is the whole store budget.
E2E_COLIMA_PROFILE="e2e-store"
E2E_COLIMA_CPUS=4
E2E_COLIMA_MEMORY_GIB=4
E2E_COLIMA_DISK_GIB=30

# Pin every docker call to the profile's socket. `docker context use` is global
# state shared with the rest of the machine, so these scripts never rely on it.
export DOCKER_HOST="unix://$HOME/.colima/$E2E_COLIMA_PROFILE/docker.sock"
export COMPOSE_PROJECT_NAME="e2e-store"
# The colima VM shares only E2E_STORE_HOME, so compose's config mounts must come
# from the installed copy (install.sh), never from a repo checkout. That copy is
# also the stable path the launchd agents run.
E2E_STORE_INSTALLED_OPS="$E2E_STORE_HOME/ops"
if [ "$E2E_STORE_OPS_DIR" != "$E2E_STORE_INSTALLED_OPS" ]; then
	printf '[e2e-store] run ops/e2e-store/install.sh, then %s/%s\n' \
		"$E2E_STORE_INSTALLED_OPS" "$(basename "$0")" >&2
	exit 64
fi
# The suite's own fixture scripts (apps/main/e2e/scripts), copied by install.sh.
E2E_FIXTURE_SCRIPTS="$E2E_STORE_OPS_DIR/fixtures"
export E2E_STORE_HOME E2E_STORE_URL E2E_STORE_LOCAL_PORT E2E_FIXTURE_SCRIPTS

# Keychain service holding every generated E2E credential (account = username).
E2E_KEYCHAIN_SERVICE="wcpos-e2e-store"
E2E_CASHIER_COUNT=16

compose() {
	docker compose -f "$E2E_STORE_OPS_DIR/compose.yaml" "$@"
}

# WP-CLI in a throwaway container on the stack's network, as www-data.
wp() {
	docker compose --progress quiet -f "$E2E_STORE_OPS_DIR/compose.yaml" \
		run --rm --no-deps -T wpcli wp "$@"
}

log() {
	printf '[e2e-store] %s\n' "$*" >&2
}

# One store-changing run at a time: seed.sh, reset.sh and snapshot.sh take this
# mkdir lock (macOS has no flock), so a nightly reset cannot restore under a
# seed's WP-CLI runs, nor a snapshot catch a half-seeded store. A holder that
# died without its EXIT trap is detected by pid. Waits up to 30 minutes.
E2E_STORE_LOCK="$E2E_STORE_HOME/.store.lock"
take_store_lock() {
	local i pid
	for i in $(seq 1 360); do
		if mkdir "$E2E_STORE_LOCK" 2>/dev/null; then
			echo "$$" >"$E2E_STORE_LOCK/pid"
			trap 'rm -rf "$E2E_STORE_LOCK"' EXIT
			return 0
		fi
		pid="$(cat "$E2E_STORE_LOCK/pid" 2>/dev/null || true)"
		if [ -n "$pid" ] && ! kill -0 "$pid" 2>/dev/null; then
			log "lock: removing stale $E2E_STORE_LOCK (pid $pid is gone)"
			rm -rf "$E2E_STORE_LOCK"
			continue
		fi
		[ "$i" = 1 ] && log "lock: waiting for pid ${pid:-?} to release $E2E_STORE_LOCK"
		sleep 5
	done
	log "lock: $E2E_STORE_LOCK still held after 30 minutes; giving up"
	exit 1
}

colima_running() {
	colima status --profile "$E2E_COLIMA_PROFILE" >/dev/null 2>&1
}

wait_for_db() {
	local i
	for i in $(seq 1 60); do
		if compose exec -T db healthcheck.sh --connect --innodb_initialized >/dev/null 2>&1; then
			return 0
		fi
		sleep 2
	done
	log "database did not become ready (after ${i} tries)"
	return 1
}
