#!/bin/bash
# Server-side ops for the #1284 ghost-prune live harness. DEV STORES ONLY.
#
# Usage: ghost-ops.sh <op> [args...]
#
# Every argument is reparsed by two remote shells (ssh -> docker exec sh -lc), so
# an unvalidated argument is a root command injection on the dev host (greptile
# review). Arguments are therefore restricted to a conservative alphanumeric
# charset here rather than escaped — the harness only ever passes ops names,
# integer ids and alphanumeric probe tokens, so anything else is a bug or an
# attack, and refusing is the correct response either way.
set -euo pipefail

CONTAINER=php-too0cos8co8g444800k00404-161048025965
HOST=wcpos-prod
WP_PATH=/var/www/html

if [ "$#" -lt 1 ]; then
	echo "usage: ghost-ops.sh <op> [args...]" >&2
	exit 2
fi

for arg in "$@"; do
	if ! printf '%s' "$arg" | grep -Eq '^[A-Za-z0-9_-]{1,64}$'; then
		echo "ghost-ops: refusing argument outside [A-Za-z0-9_-]{1,64}: '$arg'" >&2
		exit 2
	fi
done

ssh -o BatchMode=yes "$HOST" \
	"docker exec -i $CONTAINER sh -lc 'cat > /tmp/ghost-ops.php && wp eval-file /tmp/ghost-ops.php $* --path=$WP_PATH --allow-root'" \
	< "$(dirname "$0")/ghost-ops.php"
