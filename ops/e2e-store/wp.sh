#!/usr/bin/env bash
# Run WP-CLI against the E2E store, e.g. `wp.sh post list --post_type=product --format=count`.

# shellcheck source=lib.sh
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

wp "$@"
