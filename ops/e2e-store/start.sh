#!/usr/bin/env bash
# Start the E2E store: its colima profile (if down), then the compose stack.
# Idempotent; run at login by the com.kilbot.e2e-store-start launchd agent.

# shellcheck source=lib.sh
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

# The launchd agent runs this whenever it is (re)loaded, which can overlap a
# manual run or reset.sh; two concurrent `compose up`s fight over containers.
if [ -z "${E2E_STORE_START_LOCKED:-}" ]; then
	mkdir -p "$E2E_STORE_HOME/logs"
	E2E_STORE_START_LOCKED=1 exec /usr/bin/lockf -t 900 "$E2E_STORE_HOME/logs/.start.lock" "$0" "$@"
fi

mkdir -p "$E2E_STORE_HOME/data/mysql" "$E2E_STORE_HOME/data/uploads" \
	"$E2E_STORE_HOME/plugins" "$E2E_STORE_HOME/catalogue" "$E2E_STORE_HOME/snapshot" \
	"$E2E_STORE_HOME/logs"
# php-fpm (www-data) writes uploads through the VM's file share.
chmod 0777 "$E2E_STORE_HOME/data/uploads"

if ! colima_running; then
	# `colima start` switches the machine-wide docker context to the new profile,
	# which would silently move every other session's `docker` onto this VM.
	# Remember the current one and put it back.
	previous_context="$(env -u DOCKER_HOST docker context show 2>/dev/null || true)"
	log "starting colima profile $E2E_COLIMA_PROFILE (${E2E_COLIMA_CPUS} CPU / ${E2E_COLIMA_MEMORY_GIB} GiB)"
	colima start "$E2E_COLIMA_PROFILE" \
		--cpu "$E2E_COLIMA_CPUS" --memory "$E2E_COLIMA_MEMORY_GIB" --disk "$E2E_COLIMA_DISK_GIB" \
		--vm-type vz --mount-type virtiofs --mount "$E2E_STORE_HOME:w"
	if [ -n "$previous_context" ]; then
		env -u DOCKER_HOST docker context use "$previous_context" >/dev/null
	fi
fi

compose up -d --wait db wordpress nginx
log "store up on http://127.0.0.1:$E2E_STORE_LOCAL_PORT (tailnet: $E2E_STORE_URL)"
