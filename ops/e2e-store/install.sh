#!/usr/bin/env bash
# Install this directory as the running copy at ~/e2e-store/ops and load the
# launchd agents. Re-run after pulling changes to ops/e2e-store.
#
# The colima VM shares only ~/e2e-store, and launchd needs a path that outlives
# any worktree, so the stack always runs from the installed copy.

set -euo pipefail

src="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_fixtures="$src/../../apps/main/e2e/scripts"
home_dir="${E2E_STORE_HOME:-$HOME/e2e-store}"
dest="$home_dir/ops"
agents_dir="$HOME/Library/LaunchAgents"
agents=(com.kilbot.e2e-store-start com.kilbot.e2e-store-reset)

mkdir -p "$dest/fixtures" "$home_dir/logs" "$agents_dir"
rsync -a --delete --exclude fixtures/ "$src/" "$dest/"
rsync -a --delete --include '*.php' --exclude '*' "$repo_fixtures/" "$dest/fixtures/"
echo "installed $src -> $dest"

for agent in "${agents[@]}"; do
	plist="$agents_dir/$agent.plist"
	sed "s#__E2E_STORE_HOME__#$home_dir#g" "$src/$agent.plist" >"$plist"
	launchctl bootout "gui/$(id -u)/$agent" 2>/dev/null || true
	launchctl bootstrap "gui/$(id -u)" "$plist"
	echo "loaded $agent ($plist)"
done
