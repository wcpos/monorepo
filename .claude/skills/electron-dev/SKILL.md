---
name: electron-dev
user-invocable: true
description: Use when the user wants to spin up Electron dev from a worktree with logs visible in a Terminal window. Requires macOS and a standalone wcpos/electron clone.
allowed-tools:
  - Bash
  - Read
---

# Electron Dev Worktree

Spins up the desktop app from two isolated worktrees — one in this monorepo (the renderer) and one in the standalone `wcpos/electron` clone (the shell) — with logs in two visible Terminal windows.

The desktop app is no longer a submodule of this repo. The renderer (`@wcpos/main`) is served from here on port 8088 with `ELECTRON=true`; Electron loads `http://localhost:8088`.

**Announce at start:** "Setting up Electron dev worktrees."

## Steps

Run each step sequentially. Do NOT skip steps. Do NOT use `run_in_background`.

### 1. Fetch latest from the target lane in BOTH repos

Lane: `next` = in-development electron work (default); `main` = stable fixes. If unsure which lane the task is, ask the user first, then use it as `<lane>` below. The electron clone lives at `~/Projects/electron`; if it is missing, `git clone https://github.com/wcpos/electron.git ~/Projects/electron` first.

Fetch only — do NOT pull or merge into the current branch:

```bash
git fetch origin <lane>
git -C ~/Projects/electron fetch origin <lane>
```

### 2. Create the two worktrees

```bash
git worktree add .worktrees/electron-dev origin/<lane> -b electron-dev-session
git -C ~/Projects/electron worktree add ~/Projects/electron-worktrees/electron-dev origin/<lane> -b electron-dev-session
```

If either branch already exists, check for uncommitted work before removing (run the same checks against each repo):

```bash
if git -C <worktree> status --porcelain 2>/dev/null | grep -q .; then
  echo "ERROR: <worktree> has uncommitted changes. Stash or commit them first." && exit 1
fi
if git -C <repo> log origin/<lane>..electron-dev-session --oneline 2>/dev/null | grep -q .; then
  echo "ERROR: electron-dev-session has unmerged commits. Merge or back them up first." && exit 1
fi
git -C <repo> worktree remove <worktree> 2>/dev/null
git -C <repo> branch -d electron-dev-session 2>/dev/null
```

Then recreate both worktrees with the two `git worktree add` commands above.

### 3. Install dependencies

Monorepo worktree (the one install; `--frozen-lockfile` is the contract):

```bash
cd <monorepo-worktree> && pnpm install --frozen-lockfile
```

Electron worktree (its lockfile is gitignored, so a plain install):

```bash
cd <electron-worktree> && pnpm install
```

### 4. Rebuild native modules in the electron worktree

```bash
cd <electron-worktree> && CXXFLAGS="-std=c++17" pnpm rebuild:all
```

Required — Electron needs `usb` rebuilt for its Node ABI. `CXXFLAGS="-std=c++17"` is required since 2026-08-14: `usb`'s `node-addon-api` ≥ 8.9 needs C++17 (`std::void_t`, `is_null_pointer_v` errors in napi.h) while the `usb` gyp file still compiles at C++14.

### 5. Kill conflicting ports

```bash
lsof -ti :8088 | xargs kill 2>/dev/null; lsof -ti :9000 | xargs kill 2>/dev/null; echo "Ports cleared"
```

### 6. Launch in TWO visible Terminal windows

**CRITICAL: Write each launch script to a temp file, then execute it.** Inline osascript drops the `cd` from the command string.

First window — the renderer, from the monorepo worktree root:

```bash
WORKTREE_PATH="<absolute-monorepo-worktree-path>"
cat > /tmp/launch-expo-dev.sh << SCRIPT
#!/usr/bin/env bash
osascript <<'APPLESCRIPT'
tell application "Terminal"
  do script "cd \"$WORKTREE_PATH\" && pnpm dev:electron-renderer"
  activate
end tell
APPLESCRIPT
SCRIPT
bash /tmp/launch-expo-dev.sh
```

Poll until the server responds (`curl -s -o /dev/null http://localhost:8088`), then launch the second window — Electron Forge, from the electron worktree root:

```bash
ELECTRON_PATH="<absolute-electron-worktree-path>"
cat > /tmp/launch-forge-dev.sh << SCRIPT
#!/usr/bin/env bash
osascript <<'APPLESCRIPT'
tell application "Terminal"
  do script "cd \"$ELECTRON_PATH\" && pnpm dev"
  activate
end tell
APPLESCRIPT
SCRIPT
bash /tmp/launch-forge-dev.sh
```

Verify launch: within ~90s an Electron process matching the electron worktree path should appear (`pgrep -f "electron-dev.*Electron.app"`). If not, read the Forge window's output via `osascript` (`history of selected tab`) — a preload/webpack compile error kills Forge before any window opens.

Report: "Electron dev launched in Terminal windows. Logs are visible there."

## Things that will break if you get them wrong

| Mistake | Result |
|---------|--------|
| Skip `pnpm rebuild:all` in the electron worktree | Native module crashes at runtime |
| Start Electron before the renderer answers on 8088 | Electron opens a white screen against a server that is not up yet |
| Don't kill port 8088 | Expo can't bind, white screen |
| Don't kill port 9000 | Electron Forge logger crashes |
| Use `run_in_background` | User can't see logs |
| Use inline osascript | `cd` gets dropped, runs from `~`, pnpm can't find the package |
| Run the renderer with plain `expo start` | Metro resolves `.web.ts` instead of `.electron.ts`; use `dev:electron-renderer` |
| Use a different port without `EXPO_PORT` | Electron loads 8088 regardless; set `EXPO_PORT` for the electron half and `--port` for the renderer half together |

## Never

- Use `run_in_background` for either dev server
- Use inline `osascript` — always write to a temp file first
- Checkout branches in either main working tree
