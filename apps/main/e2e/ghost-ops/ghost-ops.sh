#!/bin/bash
# Usage: ghost-ops.sh <op> [args...] — runs ghost-ops.php on dev-free via wcpos-prod
set -euo pipefail
C=php-too0cos8co8g444800k00404-161048025965
ssh -o BatchMode=yes wcpos-prod "docker exec -i $C sh -lc 'cat > /tmp/ghost-ops.php && wp eval-file /tmp/ghost-ops.php $* --path=/var/www/html --allow-root'" < "$(dirname "$0")/ghost-ops.php"
