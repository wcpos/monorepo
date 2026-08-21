---
name: electron-dev
user-invocable: true
description: Use when the user wants to spin up Electron dev from a worktree with logs visible in a Terminal window. Requires macOS.
allowed-tools:
  - Bash
  - Read
---

# Electron Dev Worktree

Spins up the Electron app from an isolated worktree with logs in a visible Terminal window.

**Announce at start:** "Setting up Electron dev worktree."

## Steps

Run each step sequentially. Do NOT skip steps. Do NOT use `run_in_background`.

### 1. Fetch latest from the target lane

Lane: `next` = in-development electron work (default); `main` = stable / 1.9.x electron fixes. If unsure which lane the task is, ask the user first, then use it as `<lane>` below.

Fetch only — do NOT pull or merge into the current branch:

```bash
git fetch origin <lane>
```

### 2. Create worktree

```bash
git worktree add .worktrees/electron-dev origin/<lane> -b electron-dev-session
```

If the branch already exists, check for uncommitted work before removing:

```bash
# Check if the existing worktree has uncommitted changes
if git -C .worktrees/electron-dev status --porcelain 2>/dev/null | grep -q .; then
  echo "ERROR: .worktrees/electron-dev has uncommitted changes. Stash or commit them first." && exit 1
fi
# Check if the branch has commits not merged into main
if git log origin/<lane>..electron-dev-session --oneline 2>/dev/null | grep -q .; then
  echo "ERROR: electron-dev-session has unmerged commits. Merge or back them up first." && exit 1
fi
git worktree remove .worktrees/electron-dev 2>/dev/null
git branch -d electron-dev-session 2>/dev/null
git worktree add .worktrees/electron-dev origin/<lane> -b electron-dev-session
```

### 3. Init electron submodule and pull latest

First init the submodule (checks out whatever commit the monorepo pointer references), then pull latest from electron's main. The monorepo submodule pointer is often behind — skipping the pull means you get stale electron code.

```bash
cd <worktree-path> && git submodule update --init apps/electron
cd <worktree-path>/apps/electron && git checkout <lane> && git pull origin <lane>
```

### 4. Install dependencies

```bash
cd <worktree-path> && pnpm install --no-frozen-lockfile
```

### 5. Rebuild native modules

```bash
cd <worktree-path> && CXXFLAGS="-std=c++17" pnpm electron rebuild:all
```

This is required — Electron needs native modules rebuilt for its Node version.

`CXXFLAGS="-std=c++17"` is required since 2026-08-14: the fresh `--no-frozen-lockfile` install resolves `usb`'s `node-addon-api` to ≥8.9, which needs C++17 (`std::void_t`, `is_null_pointer_v` errors in napi.h), while the `usb` gyp file still compiles at C++14.

### 6. Kill conflicting ports

Kill any existing processes on ports 8088 (Expo/Metro) and 9000 (Electron Forge logger):

```bash
lsof -ti :8088 | xargs kill 2>/dev/null; lsof -ti :9000 | xargs kill 2>/dev/null; echo "Ports cleared"
```

### 7. Launch in TWO visible Terminal windows

**Do NOT use `pnpm --filter @wcpos/app-electron dev`.** On electron `next`, the packaged `dev` script is broken in monorepo context (electron#321): its `dev:expo` half silently no-ops because electron's own nested `pnpm-workspace.yaml` (added in electron#279) re-roots pnpm at `apps/electron`, so `--filter @wcpos/main` matches nothing and Electron opens against a dev server that never started. Launch the two halves separately from the **worktree root**.

**CRITICAL: Write each launch script to a temp file, then execute it.** Inline osascript drops the `cd` from the command string.

First window — Expo dev server:

```bash
WORKTREE_PATH="<absolute-worktree-path>"
cat > /tmp/launch-expo-dev.sh << SCRIPT
#!/usr/bin/env bash
osascript <<'APPLESCRIPT'
tell application "Terminal"
  do script "cd \"$WORKTREE_PATH\" && ELECTRON=true EXPO_NO_METRO_LAZY=true BROWSER=none pnpm --filter @wcpos/main dev --web --port 8088 --clear"
  activate
end tell
APPLESCRIPT
SCRIPT
bash /tmp/launch-expo-dev.sh
```

Poll until the server responds (`curl -s -o /dev/null http://localhost:8088`), then launch the second window — Electron Forge, also from the worktree ROOT (running `pnpm run dev:electron` with cwd `apps/electron` fails with `electron-forge: command not found` — the bin is hoisted to the monorepo root):

```bash
WORKTREE_PATH="<absolute-worktree-path>"
cat > /tmp/launch-forge-dev.sh << SCRIPT
#!/usr/bin/env bash
osascript <<'APPLESCRIPT'
tell application "Terminal"
  do script "cd \"$WORKTREE_PATH\" && pnpm --filter @wcpos/app-electron dev:electron"
  activate
end tell
APPLESCRIPT
SCRIPT
bash /tmp/launch-forge-dev.sh
```

Verify launch: within ~90s an Electron process matching the worktree path should appear (`pgrep -f "electron-dev.*Electron.app"`). If not, read the Forge window's output via `osascript` (`history of selected tab`) — a preload/webpack compile error kills Forge before any window opens.

Report: "Electron dev launched in Terminal windows. Logs are visible there."

## Things that will break if you get them wrong

| Mistake | Result |
|---------|--------|
| Skip submodule init | Electron app directory is empty, nothing runs |
| Skip `git pull` in submodule after init | Monorepo pointer is often stale — you get old electron code missing recent fixes |
| Skip `pnpm electron rebuild:all` | Native module crashes at runtime |
| Don't kill port 8088 | Expo can't bind, white screen |
| Don't kill port 9000 | Electron Forge logger crashes |
| Use `run_in_background` | User can't see logs |
| Use inline osascript | `cd` gets dropped, runs from `~`, pnpm can't find workspace |
| Use `EXPO_PORT` env var | Not supported in current electron submodule, does nothing |
| Use the packaged `pnpm dev` script (next lane) | `dev:expo` no-ops (nested workspace re-roots pnpm, electron#321) — Electron opens with no dev server |
| Run `pnpm run dev:electron` with cwd `apps/electron` | `electron-forge: command not found` — bin hoisted to monorepo root; use the root filter |

## Never

- Use `run_in_background` for the dev server
- Use inline `osascript` — always write to a temp file first
- Set `EXPO_PORT` — not supported in the current electron submodule
- Checkout branches in the main working tree
