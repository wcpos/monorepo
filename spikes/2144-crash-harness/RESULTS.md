# Spike 2144 — SQLite / OPFS crash measurements

Measured on macOS (Apple M4 Pro) across Chrome, Firefox and Playwright WebKit, and on Chrome on
Windows/NTFS (GitHub Actions), 2026-09-18; real Safari 26.6 was exercised for the in-page and reload
cells and a single-worker sanity trace only. Headline: on a real process kill, SQLite over
opfs-sahpool with WAL keeps every acknowledged transaction on all four measured targets (Chrome,
Firefox, Playwright WebKit and Windows Chrome), while the shipped OPFS filesystem engine loses acked
data on some stops. Real Safari's process-kill durability was **not scored directly** (its
external-stop script was not run); it is inferred from the shared WebKit engine result plus the
single-worker trace — see Finding 5. The only SQLite corruption is confined to DELETE
(rollback-journal) mode under a mid-commit stop, which WAL avoids; quota exhaustion is survived in
both journal modes (Finding 3). See **Findings** below; the generated tables carry every trial. This
is a throwaway instrument under `spikes/`; nothing ships. Power loss is not simulated (no browser API
can); process-kill is scored first, per the ticket.

## Environments measured (2026-09-18)

All rows: rxdb 17.4.0, rxdb-premium 17.4.0, @sqlite.org/sqlite-wasm 3.53.4-build1, esbuild 0.28.2, playwright 1.62.1.

- **Chrome 154.0.8037.44** — macOS (darwin 25.6.0 arm64), Apple M4 Pro, Node v24.14.0. `results.chrome.json`.
- **Firefox 153.0** — macOS (darwin 25.6.0 arm64), Apple M4 Pro, Node v24.14.0. `results.firefox.json` (quota cell skipped — its pref-based quota reset is unreliable; see its `skips` and Finding 3).
- **Playwright WebKit 26.5** — macOS (darwin 25.6.0 arm64), Apple M4 Pro, Node v24.14.0. `results.webkit-process.json` (process-stop only; see the WebKit note below).
- **Real Safari 26.6.2** — macOS, 8 logical CPUs (page cannot read the exact chip). `results.safari.json` (in-page A,B,E,F), `results.safari-reload.json` (cell G), `results.safari-diag.json` (sanity trace).
- **Windows Chrome 152.0.7977.83** — Windows (win32 10.0.26100 x64, NTFS), AMD EPYC 9V74, Node v22.23.2, GitHub Actions `windows-latest`. `results.windows-chrome.json`.

## Operator commands

From the repository root, with the repo's dependencies and Playwright browsers available:

```sh
bash spikes/2144-crash-harness/run.sh --build-only
node spikes/2144-crash-harness/selftest-hooks.mjs
bash spikes/2144-crash-harness/run.sh --browser chrome
bash spikes/2144-crash-harness/run.sh --browser firefox
bash spikes/2144-crash-harness/run.sh --browser webkit
```

The first command writes `.build/` bundles, verbatim `opfs.worker.js`, WASM, `versions.json`, and
`index.html`. The self-test only prints assertions. Each browser command rebuilds, writes
`results.<browser>.json` in this directory, and regenerates the marked section below.
Without `--browser`, `run.sh` runs chrome, firefox, then webkit. No browser command was run in the builder sandbox.

To run a subset without rebuilding (an existing same-named result file is overwritten):

```sh
node spikes/2144-crash-harness/drive.mjs --browser chrome --cells C,D --out spikes/2144-crash-harness/results.chrome-cd.json
node spikes/2144-crash-harness/report.mjs
```

Use distinct result filenames for disjoint subsets; do not leave duplicate measurements in the
folder. The report retains each input file as a separate source, rather than silently pooling reruns.
Driver-only cells use disposable persistent profiles; never a person's Chrome/Firefox profile.
Results are saved after completed trials. A fatal launch/driver failure is marked as an incomplete
run, not a storage verdict. Process-stop profiles are fresh per row and reused across that row's trials.

### Real Safari (not Playwright WebKit)

```sh
node spikes/2144-crash-harness/serve.mjs
```

Keep the server running, open **http://localhost:18998/** in real Safari, and click **Run A,B,E,F**.
When finished, the JSON appears in `pre#results`; click **Download results.safari.json**.
Move that downloaded file into `spikes/2144-crash-harness/`, record Safari's exact version and the
Mac's CPU in its `environment` block, then run `node spikes/2144-crash-harness/report.mjs`.
The server itself writes no results. C/D cannot be run from Safari's page.

### Windows

Dispatch `.github/workflows/spike-2144-crash.yml` on the branch containing it (see the workflow's
comment about a temporary push trigger before merge). Download `spike-2144-results-windows`, put
`results.windows-chrome.json` in this directory, and run `node spikes/2144-crash-harness/report.mjs`.
The Ubuntu job builds; the Windows job needs only Node and Playwright and runs every cell.

## Measurement conventions / limitations

- Updates use `floor(n / 5)` existing seeded IDs; integer sizes 1 and 3 cannot contain exactly 20%
  updated rows. All other rows insert unique IDs. Each non-seed transaction therefore retains at
  least one inserted row, so a wholly missing ack is observable even in the ledgerless control.
- SQLite atomically decrements the previous owner's ledger `n` on replacement. `n` records live
  ownership, not historical insert count; otherwise every update would falsely report `partial`.
  The independent page ledger retains original transaction sizes, and scoring replays expected
  ID ownership with the in-flight transaction wholly present or absent. SQLite ledger presence
  is checked first, then counts/orphans, then expected ownership. No post-stop ACK reconstruction.
- WAL boundaries use an explicit TRUNCATE checkpoint with auto-checkpoint disabled for cell A.
  The commit ACK is posted before checkpointing; a checkpoint stop can have no in-flight tx.
  Such an `ok` contributes to neither of the two in-flight subcolumns.
- `journal-before-delete` alone sets/records `journal_size_limit=0`: exclusive DELETE otherwise
  retains and zeroes the journal instead of reaching the specified truncation/release boundary.
- Dry runs use the same seed/size/cache and collect physical events. Recorded `k` and last-write
  ordinals select the armed run's main-file writes. Hook self-test recordings are synthetic traces
  derived from the installed VFS source, not captured browser runs.
- The control's tiny classic-worker console bridge imports the shipped worker verbatim. It does
  not rebuild or alter it. Recovery/parse failures and worker errors are retained in trial JSON.
- Process runs poll page ACKs every 20 ms, freeze page ACK publication and submission, take the
  final snapshot, then stop the captured browser child. The pending transaction can still finish
  in that IPC gap; it remains unacked and is scored either wholly present or absent.
- Quota trials report the failing statement/code plus physical-write exceptions or short/numeric
  returns; no translation of IOERR into FULL. A write failure's transaction remains in-flight.
- Only the specified pool/open acquisition retries are used. Cleanup is one attempt and records
  failure. No retries disguise a failed trial. Unscorable storage trials are `open-failed`.
- Main bundles/WASM/shipped worker must exceed 10,000 bytes. The two dependency-free utility
  workers are checked nonempty instead; padding them would not test build completeness.
- Cell G (reload) reloads the page between items, which re-seeds the module-scope PRNG (`rng(2144)`),
  so successive reload items draw correlated stop-timing and boundary offsets rather than independent
  ones. This narrows only cell G's sampling diversity; it does not affect the process-stop, boundary
  or quota cells (which run in one page load or use the Node-side RNG), and it does not change cell G's
  conclusion (Safari's 0% is the browsing-context poisoning of Finding 5, confirmed by the diagnostic
  independent of timing). Left as a known limitation of this throwaway instrument, not fixed.
- Quota recovery closes the original session and opens a fresh one before reopening; Chrome/Windows
  raise the quota on the new session via CDP, so the reopen is a true post-quota recovery. Firefox has
  no CDP quota override, and pref-file reset does not reliably restore quota on relaunch, so its quota
  cell is skipped (see Finding 3) rather than reported under residual pressure.
- Nothing ships, and no production code, dependency tree, patches, or application worker is changed.

<!-- generated:start -->

## chrome — results.chrome.json

| Environment | Value |
| --- | --- |
| browser | chrome |
| browserVersion | 154.0.8037.44 |
| os | darwin 25.6.0 arm64 |
| cpu | Apple M4 Pro |
| node | v24.14.0 |
| versions | {"rxdb":"17.4.0","rxdb-premium":"17.4.0","esbuild":"0.28.2","playwright":"1.62.1","@sqlite.org/sqlite-wasm":"3.53.4-build1"} |
| measuredAt | 2026-09-18T15:01:51.995Z |

### boundary-stop

| Row | Journal | Cache | Boundary | Recovery | Trials | ok | ok-with-inflight-present | ok-with-inflight-absent | lost | partial | integrity-failed | open-failed | open-failed reason | Median reopen attempts | Median reacquire ms | Median reopen ms |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| sqlite-sahpool | WAL | -16384 | wal-after-page-write | in-page | 10 | 10 | 0 | 10 | 0 | 0 | 0 | 0 | — | 8.0 | 2165.6 | 2165.6 |
| sqlite-sahpool | WAL | -64 | wal-after-page-write | in-page | 10 | 10 | 0 | 10 | 0 | 0 | 0 | 0 | — | 8.0 | 2170.7 | 2170.7 |
| sqlite-sahpool | WAL | -16384 | wal-after-commit-flush-before-checkpoint | in-page | 10 | 10 | 0 | 0 | 0 | 0 | 0 | 0 | — | 8.0 | 2194.1 | 2194.1 |
| sqlite-sahpool | WAL | -64 | wal-after-commit-flush-before-checkpoint | in-page | 10 | 10 | 0 | 0 | 0 | 0 | 0 | 0 | — | 8.0 | 2171.5 | 2171.5 |
| sqlite-sahpool | WAL | -16384 | wal-mid-checkpoint | in-page | 10 | 10 | 0 | 0 | 0 | 0 | 0 | 0 | — | 8.0 | 2198.0 | 2198.0 |
| sqlite-sahpool | WAL | -64 | wal-mid-checkpoint | in-page | 10 | 10 | 0 | 0 | 0 | 0 | 0 | 0 | — | 8.0 | 2197.8 | 2197.8 |
| sqlite-sahpool | DELETE | -16384 | journal-after-write | in-page | 10 | 10 | 0 | 10 | 0 | 0 | 0 | 0 | — | 8.0 | 2162.4 | 2162.4 |
| sqlite-sahpool | DELETE | -64 | journal-after-write | in-page | 10 | 10 | 0 | 10 | 0 | 0 | 0 | 0 | — | 8.0 | 2181.6 | 2181.6 |
| sqlite-sahpool | DELETE | -16384 | journal-after-flush-before-db-write | in-page | 10 | 10 | 0 | 10 | 0 | 0 | 0 | 0 | — | 8.0 | 2191.5 | 2191.5 |
| sqlite-sahpool | DELETE | -64 | journal-after-flush-before-db-write | in-page | 10 | 10 | 0 | 10 | 0 | 0 | 0 | 0 | — | 8.0 | 2188.9 | 2188.9 |
| sqlite-sahpool | DELETE | -16384 | db-mid-commit | in-page | 10 | 0 | 0 | 0 | 0 | 0 | 0 | 10 | SQLITE_CORRUPT (11) | 97.0 | — | 30117.0 |
| sqlite-sahpool | DELETE | -64 | db-mid-commit | in-page | 10 | 1 | 1 | 0 | 0 | 0 | 0 | 9 | SQLITE_CORRUPT (11) | 97.0 | 2225.6 | 30088.6 |
| sqlite-sahpool | WAL | -16384 | db-after-write-before-flush | in-page | 10 | 10 | 0 | 0 | 0 | 0 | 0 | 0 | — | 8.0 | 2171.1 | 2171.1 |
| sqlite-sahpool | WAL | -64 | db-after-write-before-flush | in-page | 10 | 10 | 0 | 0 | 0 | 0 | 0 | 0 | — | 8.0 | 2195.5 | 2195.5 |
| sqlite-sahpool | DELETE | -16384 | db-after-write-before-flush | in-page | 10 | 10 | 10 | 0 | 0 | 0 | 0 | 0 | — | 8.0 | 2183.2 | 2183.2 |
| sqlite-sahpool | DELETE | -64 | db-after-write-before-flush | in-page | 10 | 10 | 10 | 0 | 0 | 0 | 0 | 0 | — | 8.0 | 2206.3 | 2206.3 |
| sqlite-sahpool | DELETE | -16384 | journal-before-delete | in-page | 10 | 10 | 10 | 0 | 0 | 0 | 0 | 0 | — | 8.0 | 2205.2 | 2205.2 |
| sqlite-sahpool | DELETE | -64 | journal-before-delete | in-page | 10 | 10 | 10 | 0 | 0 | 0 | 0 | 0 | — | 8.0 | 2203.9 | 2203.9 |

### random-stop

| Row | Journal | Cache | Boundary | Recovery | Trials | ok | ok-with-inflight-present | ok-with-inflight-absent | lost | partial | integrity-failed | open-failed | open-failed reason | Median reopen attempts | Median reacquire ms | Median reopen ms |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| sqlite-sahpool | WAL | -16384 | — | in-page | 30 | 30 | 25 | 0 | 0 | 0 | 0 | 0 | — | 1.0 | 153.2 | 153.2 |
| sqlite-sahpool | DELETE | -16384 | — | in-page | 30 | 30 | 23 | 0 | 0 | 0 | 0 | 0 | — | 1.0 | 130.1 | 130.1 |
| opfs-shipped | control | default | — | in-page | 30 | 28 | 6 | 21 | 2 | 0 | 0 | 0 | — | 1.0 | 248.9 | 248.9 |

### pool-exhaustion

| Row | Journal | Cache | Boundary | Recovery | Trials | ok | ok-with-inflight-present | ok-with-inflight-absent | lost | partial | integrity-failed | open-failed | open-failed reason | Median reopen attempts | Median reacquire ms | Median reopen ms |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| sqlite-sahpool | WAL | -16384 | — | in-page | 3 | 3 | 0 | 0 | 0 | 0 | 0 | 0 | — | — | 28.3 | — |

| Trial | Opened DBs | Clean CANTOPEN + pool-full message | addCapacity recovered | Error |
| --- | --- | --- | --- | --- |
| 1 | 3 | true | true | {"name":"SQLite3Error","message":"SQLITE_CANTOPEN: sqlite3 result code 14: unable to open database file","resultCode":14} |
| 2 | 3 | true | true | {"name":"SQLite3Error","message":"SQLITE_CANTOPEN: sqlite3 result code 14: unable to open database file","resultCode":14} |
| 3 | 3 | true | true | {"name":"SQLite3Error","message":"SQLITE_CANTOPEN: sqlite3 result code 14: unable to open database file","resultCode":14} |

### handle-ceiling

| Trial | Count | Exception / ceiling | Outcome |
| --- | --- | --- | --- |
| 1 | 2048 | no ceiling below 2,048 | ok |

### terminate-latency

| Worker state | Last increment after terminate() ms | Increments after terminate() | Outcome |
| --- | --- | --- | --- |
| spinning | 2009.4 | 399100828 | ok |
| waiting | 0.0 | 0 | ok |

### slot-reuse

| Row | Journal | Cache | Boundary | Recovery | Trials | ok | ok-with-inflight-present | ok-with-inflight-absent | lost | partial | integrity-failed | open-failed | open-failed reason | Median reopen attempts | Median reacquire ms | Median reopen ms |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| sqlite-sahpool | WAL | -16384 | — | in-page | 50 | 50 | 0 | 0 | 0 | 0 | 0 | 0 | — | — | 4.4 | 54.6 |

### process-stop

| Row | Journal | Cache | Boundary | Recovery | Trials | ok | ok-with-inflight-present | ok-with-inflight-absent | lost | partial | integrity-failed | open-failed | open-failed reason | Median reopen attempts | Median reacquire ms | Median reopen ms |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| sqlite-sahpool | WAL | -16384 | — | process-relaunch | 10 | 10 | 5 | 5 | 0 | 0 | 0 | 0 | — | 1.0 | 156.7 | 156.7 |
| sqlite-sahpool | DELETE | -16384 | — | process-relaunch | 10 | 10 | 7 | 3 | 0 | 0 | 0 | 0 | — | 1.0 | 95.4 | 95.4 |
| opfs-shipped | control | default | — | process-relaunch | 10 | 10 | 0 | 10 | 0 | 0 | 0 | 0 | — | 1.0 | 238.4 | 238.4 |

### quota-exhaustion

| Mode | Trial | SQLite code | Statement / message | DOM error / numeric write return | Reopen outcome |
| --- | --- | --- | --- | --- | --- |
| WAL | 1 | 1 | COMMIT: SQLITE_ERROR: sqlite3 result code 1: cannot rollback - no transaction is active | [{"op":"write","path":"/crash-f184fdf4-8ed5-402a-b855-ea9dac8fec02-wal","offset":16773008,"length":8192,"name":"QuotaExceededError","message":"Failed to execute 'write' on 'FileSystemSyncAccessHandle': No space available for this operation"}] | ok |
| WAL | 2 | 1 | COMMIT: SQLITE_ERROR: sqlite3 result code 1: cannot rollback - no transaction is active | [{"op":"write","path":"/crash-801a6e65-05b3-466a-8422-5cf77a1f91fd-wal","offset":16773008,"length":8192,"name":"QuotaExceededError","message":"Failed to execute 'write' on 'FileSystemSyncAccessHandle': No space available for this operation"}] | ok |
| WAL | 3 | 1 | COMMIT: SQLITE_ERROR: sqlite3 result code 1: cannot rollback - no transaction is active | [{"op":"write","path":"/crash-1c8711ee-9c87-41ed-b870-1c2858ba2f3a-wal","offset":16773008,"length":8192,"name":"QuotaExceededError","message":"Failed to execute 'write' on 'FileSystemSyncAccessHandle': No space available for this operation"}] | ok |
| DELETE | 1 | 1 | COMMIT: SQLITE_ERROR: sqlite3 result code 1: cannot rollback - no transaction is active | [{"op":"write","path":"/crash-3fe19f5e-cf48-4414-a0f4-78acfed8b752","offset":33550336,"length":8192,"name":"QuotaExceededError","message":"Failed to execute 'write' on 'FileSystemSyncAccessHandle': No space available for this operation"}] | ok |
| DELETE | 2 | 1 | COMMIT: SQLITE_ERROR: sqlite3 result code 1: cannot rollback - no transaction is active | [{"op":"write","path":"/crash-7f9e22c2-2bdd-47d0-8e03-53e9687d0da8","offset":33550336,"length":8192,"name":"QuotaExceededError","message":"Failed to execute 'write' on 'FileSystemSyncAccessHandle': No space available for this operation"}] | ok |
| DELETE | 3 | 1 | COMMIT: SQLITE_ERROR: sqlite3 result code 1: cannot rollback - no transaction is active | [{"op":"write","path":"/crash-ecdef7f1-60f2-4edc-9c0a-532feb9a3e18","offset":33550336,"length":8192,"name":"QuotaExceededError","message":"Failed to execute 'write' on 'FileSystemSyncAccessHandle': No space available for this operation"}] | ok |

## firefox — results.firefox.json

| Environment | Value |
| --- | --- |
| browser | firefox |
| browserVersion | 153.0 |
| os | darwin 25.6.0 arm64 |
| cpu | Apple M4 Pro |
| node | v24.14.0 |
| versions | {"rxdb":"17.4.0","rxdb-premium":"17.4.0","esbuild":"0.28.2","playwright":"1.62.1","@sqlite.org/sqlite-wasm":"3.53.4-build1"} |
| measuredAt | 2026-09-18T15:24:55.360Z |

Not run: quota-exhaustion — Firefox quota reset is pref-file based (not the CDP quota override Chrome uses); it does not reliably restore quota on relaunch, so reopen-after-quota is measured under residual quota pressure (reopens of 90-112 s, some harness timeouts, no data loss when completed) and is not a trustworthy measurement. Chrome and Windows (CDP quota override) carry the quota answer.

### boundary-stop

| Row | Journal | Cache | Boundary | Recovery | Trials | ok | ok-with-inflight-present | ok-with-inflight-absent | lost | partial | integrity-failed | open-failed | open-failed reason | Median reopen attempts | Median reacquire ms | Median reopen ms |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| sqlite-sahpool | WAL | -16384 | wal-after-page-write | in-page | 10 | 10 | 0 | 10 | 0 | 0 | 0 | 0 | — | 1.0 | 73.3 | 73.4 |
| sqlite-sahpool | WAL | -64 | wal-after-page-write | in-page | 10 | 10 | 0 | 10 | 0 | 0 | 0 | 0 | — | 1.0 | 93.1 | 93.1 |
| sqlite-sahpool | WAL | -16384 | wal-after-commit-flush-before-checkpoint | in-page | 10 | 10 | 0 | 0 | 0 | 0 | 0 | 0 | — | 1.0 | 86.9 | 86.9 |
| sqlite-sahpool | WAL | -64 | wal-after-commit-flush-before-checkpoint | in-page | 10 | 10 | 0 | 0 | 0 | 0 | 0 | 0 | — | 1.0 | 120.7 | 120.7 |
| sqlite-sahpool | WAL | -16384 | wal-mid-checkpoint | in-page | 10 | 10 | 0 | 0 | 0 | 0 | 0 | 0 | — | 1.0 | 86.4 | 86.4 |
| sqlite-sahpool | WAL | -64 | wal-mid-checkpoint | in-page | 10 | 10 | 0 | 0 | 0 | 0 | 0 | 0 | — | 1.0 | 120.5 | 120.5 |
| sqlite-sahpool | DELETE | -16384 | journal-after-write | in-page | 10 | 10 | 0 | 10 | 0 | 0 | 0 | 0 | — | 1.0 | 73.9 | 73.9 |
| sqlite-sahpool | DELETE | -64 | journal-after-write | in-page | 10 | 10 | 0 | 10 | 0 | 0 | 0 | 0 | — | 1.0 | 92.9 | 92.9 |
| sqlite-sahpool | DELETE | -16384 | journal-after-flush-before-db-write | in-page | 10 | 10 | 0 | 10 | 0 | 0 | 0 | 0 | — | 1.0 | 75.2 | 75.2 |
| sqlite-sahpool | DELETE | -64 | journal-after-flush-before-db-write | in-page | 10 | 10 | 0 | 10 | 0 | 0 | 0 | 0 | — | 1.0 | 96.9 | 96.9 |
| sqlite-sahpool | DELETE | -16384 | db-mid-commit | in-page | 10 | 0 | 0 | 0 | 0 | 0 | 0 | 10 | SQLITE_CORRUPT (11) | 1.0 | — | 57.5 |
| sqlite-sahpool | DELETE | -64 | db-mid-commit | in-page | 10 | 1 | 1 | 0 | 0 | 0 | 0 | 9 | SQLITE_CORRUPT (11) | 1.0 | 114.0 | 57.5 |
| sqlite-sahpool | WAL | -16384 | db-after-write-before-flush | in-page | 10 | 10 | 0 | 0 | 0 | 0 | 0 | 0 | — | 1.0 | 88.0 | 88.0 |
| sqlite-sahpool | WAL | -64 | db-after-write-before-flush | in-page | 10 | 10 | 0 | 0 | 0 | 0 | 0 | 0 | — | 1.0 | 120.3 | 120.3 |
| sqlite-sahpool | DELETE | -16384 | db-after-write-before-flush | in-page | 10 | 10 | 10 | 0 | 0 | 0 | 0 | 0 | — | 1.0 | 79.3 | 79.3 |
| sqlite-sahpool | DELETE | -64 | db-after-write-before-flush | in-page | 10 | 10 | 10 | 0 | 0 | 0 | 0 | 0 | — | 1.0 | 113.9 | 113.9 |
| sqlite-sahpool | DELETE | -16384 | journal-before-delete | in-page | 10 | 10 | 10 | 0 | 0 | 0 | 0 | 0 | — | 1.0 | 72.2 | 72.2 |
| sqlite-sahpool | DELETE | -64 | journal-before-delete | in-page | 10 | 10 | 10 | 0 | 0 | 0 | 0 | 0 | — | 1.0 | 93.5 | 93.5 |

### random-stop

| Row | Journal | Cache | Boundary | Recovery | Trials | ok | ok-with-inflight-present | ok-with-inflight-absent | lost | partial | integrity-failed | open-failed | open-failed reason | Median reopen attempts | Median reacquire ms | Median reopen ms |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| sqlite-sahpool | WAL | -16384 | — | in-page | 30 | 30 | 4 | 19 | 0 | 0 | 0 | 0 | — | 1.0 | 221.3 | 221.3 |
| sqlite-sahpool | DELETE | default | — | in-page | 8 | 0 | 0 | 0 | 0 | 0 | 0 | 8 | SQLITE_CORRUPT (11) | 1.0 | — | 56.2 |
| sqlite-sahpool | DELETE | -16384 | — | in-page | 22 | 22 | 1 | 14 | 0 | 0 | 0 | 0 | — | 1.0 | 254.5 | 254.5 |
| opfs-shipped | control | default | — | in-page | 30 | 25 | 1 | 24 | 3 | 0 | 0 | 2 | Error | 1.0 | 221.5 | 229.4 |

### pool-exhaustion

| Row | Journal | Cache | Boundary | Recovery | Trials | ok | ok-with-inflight-present | ok-with-inflight-absent | lost | partial | integrity-failed | open-failed | open-failed reason | Median reopen attempts | Median reacquire ms | Median reopen ms |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| sqlite-sahpool | WAL | -16384 | — | in-page | 3 | 3 | 0 | 0 | 0 | 0 | 0 | 0 | — | — | 14.1 | — |

| Trial | Opened DBs | Clean CANTOPEN + pool-full message | addCapacity recovered | Error |
| --- | --- | --- | --- | --- |
| 1 | 3 | true | true | {"name":"SQLite3Error","message":"SQLITE_CANTOPEN: sqlite3 result code 14: unable to open database file","resultCode":14} |
| 2 | 3 | true | true | {"name":"SQLite3Error","message":"SQLITE_CANTOPEN: sqlite3 result code 14: unable to open database file","resultCode":14} |
| 3 | 3 | true | true | {"name":"SQLite3Error","message":"SQLITE_CANTOPEN: sqlite3 result code 14: unable to open database file","resultCode":14} |

### handle-ceiling

| Trial | Count | Exception / ceiling | Outcome |
| --- | --- | --- | --- |
| 1 | 2048 | no ceiling below 2,048 | ok |

### terminate-latency

| Worker state | Last increment after terminate() ms | Increments after terminate() | Outcome |
| --- | --- | --- | --- |
| spinning | 6.4 | 3730 | ok |
| waiting | 0.0 | 0 | ok |

### slot-reuse

| Row | Journal | Cache | Boundary | Recovery | Trials | ok | ok-with-inflight-present | ok-with-inflight-absent | lost | partial | integrity-failed | open-failed | open-failed reason | Median reopen attempts | Median reacquire ms | Median reopen ms |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| sqlite-sahpool | WAL | -16384 | — | in-page | 50 | 50 | 0 | 0 | 0 | 0 | 0 | 0 | — | — | 9.4 | 57.5 |

### process-stop

| Row | Journal | Cache | Boundary | Recovery | Trials | ok | ok-with-inflight-present | ok-with-inflight-absent | lost | partial | integrity-failed | open-failed | open-failed reason | Median reopen attempts | Median reacquire ms | Median reopen ms |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| sqlite-sahpool | WAL | -16384 | — | process-relaunch | 10 | 10 | 4 | 6 | 0 | 0 | 0 | 0 | — | 1.0 | 285.9 | 286.0 |
| sqlite-sahpool | DELETE | -16384 | — | process-relaunch | 10 | 10 | 3 | 7 | 0 | 0 | 0 | 0 | — | 1.0 | 165.1 | 165.1 |
| opfs-shipped | control | default | — | process-relaunch | 10 | 9 | 0 | 9 | 0 | 1 | 0 | 0 | — | 1.0 | 257.7 | 257.7 |

## safari — results.safari-reload.json

| Environment | Value |
| --- | --- |
| browser | safari |
| browserVersion | Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.6.2 Safari/605.1.15 |
| os | MacIntel |
| cpu | unknown (8 logical CPUs) |
| node | null |
| versions | {"rxdb":"17.4.0","rxdb-premium":"17.4.0","esbuild":"0.28.2","playwright":"1.62.1","@sqlite.org/sqlite-wasm":"3.53.4-build1"} |
| measuredAt | 2026-09-18T15:30:37.397Z |

### boundary-stop

| Row | Journal | Cache | Boundary | Recovery | Trials | ok | ok-with-inflight-present | ok-with-inflight-absent | lost | partial | integrity-failed | open-failed | open-failed reason | Median reopen attempts | Median reacquire ms | Median reopen ms |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| sqlite-sahpool | WAL | default | wal-after-page-write | reload | 3 | 0 | 0 | 0 | 0 | 0 | 0 | 3 | InvalidStateError | 1.0 | — | 37.6 |
| sqlite-sahpool | WAL | default | wal-after-commit-flush-before-checkpoint | reload | 3 | 0 | 0 | 0 | 0 | 0 | 0 | 3 | InvalidStateError | 1.0 | — | 37.6 |
| sqlite-sahpool | WAL | default | wal-mid-checkpoint | reload | 3 | 0 | 0 | 0 | 0 | 0 | 0 | 3 | InvalidStateError | 1.0 | — | 35.5 |
| sqlite-sahpool | DELETE | default | journal-after-write | reload | 3 | 0 | 0 | 0 | 0 | 0 | 0 | 3 | InvalidStateError | 1.0 | — | 38.9 |
| sqlite-sahpool | DELETE | default | journal-after-flush-before-db-write | reload | 3 | 0 | 0 | 0 | 0 | 0 | 0 | 3 | InvalidStateError | 1.0 | — | 38.8 |
| sqlite-sahpool | DELETE | default | db-mid-commit | reload | 3 | 0 | 0 | 0 | 0 | 0 | 0 | 3 | InvalidStateError | 1.0 | — | 38.1 |
| sqlite-sahpool | WAL | default | db-after-write-before-flush | reload | 3 | 0 | 0 | 0 | 0 | 0 | 0 | 3 | InvalidStateError | 1.0 | — | 40.2 |
| sqlite-sahpool | DELETE | default | db-after-write-before-flush | reload | 3 | 0 | 0 | 0 | 0 | 0 | 0 | 3 | UnknownError | — | — | — |
| sqlite-sahpool | DELETE | default | journal-before-delete | reload | 3 | 0 | 0 | 0 | 0 | 0 | 0 | 3 | UnknownError | — | — | — |

### random-stop

| Row | Journal | Cache | Boundary | Recovery | Trials | ok | ok-with-inflight-present | ok-with-inflight-absent | lost | partial | integrity-failed | open-failed | open-failed reason | Median reopen attempts | Median reacquire ms | Median reopen ms |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| sqlite-sahpool | WAL | default | — | reload | 10 | 0 | 0 | 0 | 0 | 0 | 0 | 10 | UnknownError | — | — | — |
| sqlite-sahpool | DELETE | default | — | reload | 10 | 0 | 0 | 0 | 0 | 0 | 0 | 10 | UnknownError | — | — | — |
| opfs-shipped | control | default | — | reload | 10 | 0 | 0 | 0 | 0 | 0 | 0 | 10 | Error | 1.0 | — | 10011.7 |

## safari — results.safari.json

| Environment | Value |
| --- | --- |
| browser | safari |
| browserVersion | Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.6.2 Safari/605.1.15 |
| os | MacIntel |
| cpu | unknown (8 logical CPUs) |
| node | null |
| versions | {"rxdb":"17.4.0","rxdb-premium":"17.4.0","esbuild":"0.28.2","playwright":"1.62.1","@sqlite.org/sqlite-wasm":"3.53.4-build1"} |
| measuredAt | 2026-09-18T15:20:24.667Z |

### boundary-stop

| Row | Journal | Cache | Boundary | Recovery | Trials | ok | ok-with-inflight-present | ok-with-inflight-absent | lost | partial | integrity-failed | open-failed | open-failed reason | Median reopen attempts | Median reacquire ms | Median reopen ms |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| sqlite-sahpool | WAL | -16384 | wal-after-page-write | in-page | 10 | 0 | 0 | 0 | 0 | 0 | 0 | 10 | SQLITE_CANTOPEN (14) | 82.5 | — | 30222.6 |
| sqlite-sahpool | WAL | -64 | wal-after-page-write | in-page | 10 | 0 | 0 | 0 | 0 | 0 | 0 | 10 | SQLITE_CANTOPEN (14) | 80.0 | — | 30283.6 |
| sqlite-sahpool | WAL | -16384 | wal-after-commit-flush-before-checkpoint | in-page | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 1 | UnknownError | 84.0 | — | 30324.9 |
| sqlite-sahpool | WAL | default | wal-after-commit-flush-before-checkpoint | in-page | 9 | 0 | 0 | 0 | 0 | 0 | 0 | 9 | UnknownError | — | — | — |
| sqlite-sahpool | WAL | -64 | wal-after-commit-flush-before-checkpoint | in-page | 10 | 0 | 0 | 0 | 0 | 0 | 0 | 10 | UnknownError | — | — | — |
| sqlite-sahpool | WAL | default | wal-mid-checkpoint | in-page | 10 | 0 | 0 | 0 | 0 | 0 | 0 | 10 | UnknownError | — | — | — |
| sqlite-sahpool | WAL | -64 | wal-mid-checkpoint | in-page | 10 | 0 | 0 | 0 | 0 | 0 | 0 | 10 | UnknownError | — | — | — |
| sqlite-sahpool | DELETE | default | journal-after-write | in-page | 10 | 0 | 0 | 0 | 0 | 0 | 0 | 10 | UnknownError | — | — | — |
| sqlite-sahpool | DELETE | -64 | journal-after-write | in-page | 10 | 0 | 0 | 0 | 0 | 0 | 0 | 10 | UnknownError | — | — | — |
| sqlite-sahpool | DELETE | default | journal-after-flush-before-db-write | in-page | 10 | 0 | 0 | 0 | 0 | 0 | 0 | 10 | UnknownError | — | — | — |
| sqlite-sahpool | DELETE | -64 | journal-after-flush-before-db-write | in-page | 10 | 0 | 0 | 0 | 0 | 0 | 0 | 10 | UnknownError | — | — | — |
| sqlite-sahpool | DELETE | default | db-mid-commit | in-page | 10 | 0 | 0 | 0 | 0 | 0 | 0 | 10 | UnknownError | — | — | — |
| sqlite-sahpool | DELETE | -64 | db-mid-commit | in-page | 10 | 0 | 0 | 0 | 0 | 0 | 0 | 10 | UnknownError | — | — | — |
| sqlite-sahpool | WAL | default | db-after-write-before-flush | in-page | 10 | 0 | 0 | 0 | 0 | 0 | 0 | 10 | UnknownError | — | — | — |
| sqlite-sahpool | WAL | -64 | db-after-write-before-flush | in-page | 10 | 0 | 0 | 0 | 0 | 0 | 0 | 10 | UnknownError | — | — | — |
| sqlite-sahpool | DELETE | default | db-after-write-before-flush | in-page | 10 | 0 | 0 | 0 | 0 | 0 | 0 | 10 | UnknownError | — | — | — |
| sqlite-sahpool | DELETE | -64 | db-after-write-before-flush | in-page | 10 | 0 | 0 | 0 | 0 | 0 | 0 | 10 | UnknownError | — | — | — |
| sqlite-sahpool | DELETE | default | journal-before-delete | in-page | 10 | 0 | 0 | 0 | 0 | 0 | 0 | 10 | UnknownError | — | — | — |
| sqlite-sahpool | DELETE | -64 | journal-before-delete | in-page | 10 | 0 | 0 | 0 | 0 | 0 | 0 | 10 | UnknownError | — | — | — |

### random-stop

| Row | Journal | Cache | Boundary | Recovery | Trials | ok | ok-with-inflight-present | ok-with-inflight-absent | lost | partial | integrity-failed | open-failed | open-failed reason | Median reopen attempts | Median reacquire ms | Median reopen ms |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| sqlite-sahpool | WAL | default | — | in-page | 30 | 0 | 0 | 0 | 0 | 0 | 0 | 30 | UnknownError | — | — | — |
| sqlite-sahpool | DELETE | default | — | in-page | 30 | 0 | 0 | 0 | 0 | 0 | 0 | 30 | UnknownError | — | — | — |
| opfs-shipped | control | default | — | in-page | 30 | 0 | 0 | 0 | 0 | 0 | 0 | 30 | Error | 1.0 | — | 10018.6 |

### pool-exhaustion

| Row | Journal | Cache | Boundary | Recovery | Trials | ok | ok-with-inflight-present | ok-with-inflight-absent | lost | partial | integrity-failed | open-failed | open-failed reason | Median reopen attempts | Median reacquire ms | Median reopen ms |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| sqlite-sahpool | WAL | default | — | in-page | 3 | 0 | 0 | 0 | 0 | 0 | 0 | 3 | UnknownError | — | — | — |

| Trial | Opened DBs | Clean CANTOPEN + pool-full message | addCapacity recovered | Error |
| --- | --- | --- | --- | --- |
| 1 | — | — | — | {"name":"UnknownError","message":"Invalid platform file handle","resultCode":null} |
| 2 | — | — | — | {"name":"UnknownError","message":"Invalid platform file handle","resultCode":null} |
| 3 | — | — | — | {"name":"UnknownError","message":"Invalid platform file handle","resultCode":null} |

### handle-ceiling

| Trial | Count | Exception / ceiling | Outcome |
| --- | --- | --- | --- |
| 1 | 1 | {"name":"UnknownError","message":"Invalid platform file handle","resultCode":null} | ok |

### terminate-latency

| Worker state | Last increment after terminate() ms | Increments after terminate() | Outcome |
| --- | --- | --- | --- |
| spinning | 5.3 | 82705 | ok |
| waiting | 0.0 | 0 | ok |

### slot-reuse

| Row | Journal | Cache | Boundary | Recovery | Trials | ok | ok-with-inflight-present | ok-with-inflight-absent | lost | partial | integrity-failed | open-failed | open-failed reason | Median reopen attempts | Median reacquire ms | Median reopen ms |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| sqlite-sahpool | WAL | default | — | in-page | 50 | 0 | 0 | 0 | 0 | 0 | 0 | 50 | UnknownError | — | — | — |

## webkit — results.webkit-process.json

| Environment | Value |
| --- | --- |
| browser | webkit |
| browserVersion | 26.5 |
| os | darwin 25.6.0 arm64 |
| cpu | Apple M4 Pro |
| node | v24.14.0 |
| versions | {"rxdb":"17.4.0","rxdb-premium":"17.4.0","esbuild":"0.28.2","playwright":"1.62.1","@sqlite.org/sqlite-wasm":"3.53.4-build1"} |
| measuredAt | 2026-09-18T15:43:19.478Z |

### process-stop

| Row | Journal | Cache | Boundary | Recovery | Trials | ok | ok-with-inflight-present | ok-with-inflight-absent | lost | partial | integrity-failed | open-failed | open-failed reason | Median reopen attempts | Median reacquire ms | Median reopen ms |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| sqlite-sahpool | WAL | -16384 | — | process-relaunch | 10 | 10 | 9 | 0 | 0 | 0 | 0 | 0 | — | 1.0 | 318.5 | 318.5 |
| sqlite-sahpool | DELETE | -16384 | — | process-relaunch | 10 | 10 | 10 | 0 | 0 | 0 | 0 | 0 | — | 1.0 | 193.5 | 193.5 |
| opfs-shipped | control | default | — | process-relaunch | 10 | 10 | 10 | 0 | 0 | 0 | 0 | 0 | — | 1.0 | 487.5 | 487.5 |

## chrome — results.windows-chrome.json

| Environment | Value |
| --- | --- |
| browser | chrome |
| browserVersion | 152.0.7977.83 |
| os | win32 10.0.26100 x64 |
| cpu | AMD EPYC 9V74 80-Core Processor                 |
| node | v22.23.2 |
| versions | {"rxdb":"17.4.0","rxdb-premium":"17.4.0","esbuild":"0.28.2","playwright":"1.62.1","@sqlite.org/sqlite-wasm":"3.53.4-build1"} |
| measuredAt | 2026-09-18T18:03:30.946Z |

### boundary-stop

| Row | Journal | Cache | Boundary | Recovery | Trials | ok | ok-with-inflight-present | ok-with-inflight-absent | lost | partial | integrity-failed | open-failed | open-failed reason | Median reopen attempts | Median reacquire ms | Median reopen ms |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| sqlite-sahpool | WAL | -16384 | wal-after-page-write | in-page | 10 | 10 | 0 | 10 | 0 | 0 | 0 | 0 | — | 1.0 | 2713.5 | 2713.5 |
| sqlite-sahpool | WAL | -64 | wal-after-page-write | in-page | 10 | 10 | 0 | 10 | 0 | 0 | 0 | 0 | — | 1.0 | 2708.9 | 2708.9 |
| sqlite-sahpool | WAL | -16384 | wal-after-commit-flush-before-checkpoint | in-page | 10 | 10 | 0 | 0 | 0 | 0 | 0 | 0 | — | 1.0 | 2459.0 | 2459.0 |
| sqlite-sahpool | WAL | -64 | wal-after-commit-flush-before-checkpoint | in-page | 10 | 10 | 0 | 0 | 0 | 0 | 0 | 0 | — | 1.0 | 2475.3 | 2475.3 |
| sqlite-sahpool | WAL | -16384 | wal-mid-checkpoint | in-page | 10 | 10 | 0 | 0 | 0 | 0 | 0 | 0 | — | 1.0 | 2473.5 | 2473.5 |
| sqlite-sahpool | WAL | -64 | wal-mid-checkpoint | in-page | 10 | 10 | 0 | 0 | 0 | 0 | 0 | 0 | — | 1.0 | 2493.6 | 2493.6 |
| sqlite-sahpool | DELETE | -16384 | journal-after-write | in-page | 10 | 10 | 0 | 10 | 0 | 0 | 0 | 0 | — | 1.0 | 2710.7 | 2710.7 |
| sqlite-sahpool | DELETE | -64 | journal-after-write | in-page | 10 | 10 | 0 | 10 | 0 | 0 | 0 | 0 | — | 1.0 | 2713.8 | 2713.8 |
| sqlite-sahpool | DELETE | -16384 | journal-after-flush-before-db-write | in-page | 10 | 10 | 0 | 10 | 0 | 0 | 0 | 0 | — | 1.0 | 2698.5 | 2698.5 |
| sqlite-sahpool | DELETE | -64 | journal-after-flush-before-db-write | in-page | 10 | 10 | 0 | 10 | 0 | 0 | 0 | 0 | — | 1.0 | 2725.9 | 2725.9 |
| sqlite-sahpool | DELETE | -16384 | db-mid-commit | in-page | 10 | 0 | 0 | 0 | 0 | 0 | 0 | 10 | SQLITE_CORRUPT (11) | 1.0 | — | 2691.0 |
| sqlite-sahpool | DELETE | -64 | db-mid-commit | in-page | 10 | 1 | 1 | 0 | 0 | 0 | 0 | 9 | SQLITE_CORRUPT (11) | 1.0 | 2741.9 | 2725.3 |
| sqlite-sahpool | WAL | -16384 | db-after-write-before-flush | in-page | 10 | 10 | 0 | 0 | 0 | 0 | 0 | 0 | — | 1.0 | 2465.1 | 2465.1 |
| sqlite-sahpool | WAL | -64 | db-after-write-before-flush | in-page | 10 | 10 | 0 | 0 | 0 | 0 | 0 | 0 | — | 1.0 | 2475.4 | 2475.4 |
| sqlite-sahpool | DELETE | -16384 | db-after-write-before-flush | in-page | 10 | 10 | 10 | 0 | 0 | 0 | 0 | 0 | — | 1.0 | 2479.4 | 2479.4 |
| sqlite-sahpool | DELETE | -64 | db-after-write-before-flush | in-page | 10 | 10 | 10 | 0 | 0 | 0 | 0 | 0 | — | 1.0 | 2733.5 | 2733.5 |
| sqlite-sahpool | DELETE | -16384 | journal-before-delete | in-page | 10 | 10 | 10 | 0 | 0 | 0 | 0 | 0 | — | 1.0 | 2690.4 | 2690.4 |
| sqlite-sahpool | DELETE | -64 | journal-before-delete | in-page | 10 | 10 | 10 | 0 | 0 | 0 | 0 | 0 | — | 1.0 | 2707.6 | 2707.6 |
| sqlite-sahpool | WAL | -16384 | wal-after-page-write | reload | 3 | 3 | 0 | 3 | 0 | 0 | 0 | 0 | — | 1.0 | 2337.6 | 2337.6 |
| sqlite-sahpool | WAL | -16384 | wal-after-commit-flush-before-checkpoint | reload | 3 | 3 | 0 | 0 | 0 | 0 | 0 | 0 | — | 1.0 | 2338.1 | 2338.1 |
| sqlite-sahpool | WAL | -16384 | wal-mid-checkpoint | reload | 3 | 3 | 0 | 0 | 0 | 0 | 0 | 0 | — | 1.0 | 2343.8 | 2343.8 |
| sqlite-sahpool | DELETE | -16384 | journal-after-write | reload | 3 | 3 | 0 | 3 | 0 | 0 | 0 | 0 | — | 1.0 | 2353.4 | 2353.4 |
| sqlite-sahpool | DELETE | -16384 | journal-after-flush-before-db-write | reload | 3 | 3 | 0 | 3 | 0 | 0 | 0 | 0 | — | 1.0 | 2345.1 | 2345.1 |
| sqlite-sahpool | DELETE | default | db-mid-commit | reload | 3 | 0 | 0 | 0 | 0 | 0 | 0 | 3 | SQLITE_CORRUPT (11) | 1.0 | — | 2318.8 |
| sqlite-sahpool | WAL | -16384 | db-after-write-before-flush | reload | 3 | 3 | 0 | 0 | 0 | 0 | 0 | 0 | — | 1.0 | 2345.5 | 2345.5 |
| sqlite-sahpool | DELETE | -16384 | db-after-write-before-flush | reload | 3 | 3 | 3 | 0 | 0 | 0 | 0 | 0 | — | 1.0 | 2339.5 | 2339.5 |
| sqlite-sahpool | DELETE | -16384 | journal-before-delete | reload | 3 | 3 | 3 | 0 | 0 | 0 | 0 | 0 | — | 1.0 | 2338.7 | 2338.7 |

### random-stop

| Row | Journal | Cache | Boundary | Recovery | Trials | ok | ok-with-inflight-present | ok-with-inflight-absent | lost | partial | integrity-failed | open-failed | open-failed reason | Median reopen attempts | Median reacquire ms | Median reopen ms |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| sqlite-sahpool | WAL | -16384 | — | in-page | 30 | 30 | 28 | 0 | 0 | 0 | 0 | 0 | — | 1.0 | 2761.6 | 2761.6 |
| sqlite-sahpool | DELETE | -16384 | — | in-page | 30 | 30 | 30 | 0 | 0 | 0 | 0 | 0 | — | 1.0 | 2724.7 | 2724.7 |
| opfs-shipped | control | default | — | in-page | 30 | 27 | 2 | 25 | 3 | 0 | 0 | 0 | — | 1.0 | 310.2 | 310.2 |
| sqlite-sahpool | WAL | -16384 | — | reload | 10 | 10 | 10 | 0 | 0 | 0 | 0 | 0 | — | 1.0 | 2369.9 | 2370.0 |
| sqlite-sahpool | DELETE | -16384 | — | reload | 10 | 10 | 9 | 0 | 0 | 0 | 0 | 0 | — | 1.0 | 2367.8 | 2367.8 |
| opfs-shipped | control | default | — | reload | 10 | 10 | 0 | 10 | 0 | 0 | 0 | 0 | — | 1.0 | 134.8 | 134.8 |

### pool-exhaustion

| Row | Journal | Cache | Boundary | Recovery | Trials | ok | ok-with-inflight-present | ok-with-inflight-absent | lost | partial | integrity-failed | open-failed | open-failed reason | Median reopen attempts | Median reacquire ms | Median reopen ms |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| sqlite-sahpool | WAL | -16384 | — | in-page | 3 | 3 | 0 | 0 | 0 | 0 | 0 | 0 | — | — | 119.2 | — |

| Trial | Opened DBs | Clean CANTOPEN + pool-full message | addCapacity recovered | Error |
| --- | --- | --- | --- | --- |
| 1 | 3 | true | true | {"name":"SQLite3Error","message":"SQLITE_CANTOPEN: sqlite3 result code 14: unable to open database file","resultCode":14} |
| 2 | 3 | true | true | {"name":"SQLite3Error","message":"SQLITE_CANTOPEN: sqlite3 result code 14: unable to open database file","resultCode":14} |
| 3 | 3 | true | true | {"name":"SQLite3Error","message":"SQLITE_CANTOPEN: sqlite3 result code 14: unable to open database file","resultCode":14} |

### handle-ceiling

| Trial | Count | Exception / ceiling | Outcome |
| --- | --- | --- | --- |
| 1 | 2048 | no ceiling below 2,048 | ok |

### terminate-latency

| Worker state | Last increment after terminate() ms | Increments after terminate() | Outcome |
| --- | --- | --- | --- |
| spinning | 2008.6 | 165734217 | ok |
| waiting | 0.0 | 0 | ok |

### slot-reuse

| Row | Journal | Cache | Boundary | Recovery | Trials | ok | ok-with-inflight-present | ok-with-inflight-absent | lost | partial | integrity-failed | open-failed | open-failed reason | Median reopen attempts | Median reacquire ms | Median reopen ms |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| sqlite-sahpool | WAL | -16384 | — | in-page | 50 | 50 | 0 | 0 | 0 | 0 | 0 | 0 | — | — | 43.7 | 2738.0 |

### process-stop

| Row | Journal | Cache | Boundary | Recovery | Trials | ok | ok-with-inflight-present | ok-with-inflight-absent | lost | partial | integrity-failed | open-failed | open-failed reason | Median reopen attempts | Median reacquire ms | Median reopen ms |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| sqlite-sahpool | WAL | -16384 | — | process-relaunch | 10 | 10 | 9 | 1 | 0 | 0 | 0 | 0 | — | 1.0 | 2276.2 | 2276.2 |
| sqlite-sahpool | DELETE | -16384 | — | process-relaunch | 10 | 10 | 9 | 1 | 0 | 0 | 0 | 0 | — | 1.0 | 2246.2 | 2246.2 |
| opfs-shipped | control | default | — | process-relaunch | 10 | 10 | 0 | 10 | 0 | 0 | 0 | 0 | — | 1.0 | 345.7 | 345.7 |

### quota-exhaustion

| Mode | Trial | SQLite code | Statement / message | DOM error / numeric write return | Reopen outcome |
| --- | --- | --- | --- | --- | --- |
| WAL | 1 | 1 | COMMIT: SQLITE_ERROR: sqlite3 result code 1: cannot rollback - no transaction is active | [{"op":"write","path":"/crash-054fe3c8-16ce-4b5e-a72c-5093fdcbeb98-wal","offset":16773008,"length":8192,"name":"QuotaExceededError","message":"Failed to execute 'write' on 'FileSystemSyncAccessHandle': No space available for this operation"}] | ok |
| WAL | 2 | 1 | COMMIT: SQLITE_ERROR: sqlite3 result code 1: cannot rollback - no transaction is active | [{"op":"write","path":"/crash-69f105ea-d966-40f7-a419-ebe978933946-wal","offset":16773008,"length":8192,"name":"QuotaExceededError","message":"Failed to execute 'write' on 'FileSystemSyncAccessHandle': No space available for this operation"}] | ok |
| WAL | 3 | 1 | COMMIT: SQLITE_ERROR: sqlite3 result code 1: cannot rollback - no transaction is active | [{"op":"write","path":"/crash-9034e174-aab8-403f-9052-5ba69606aa10-wal","offset":16773008,"length":8192,"name":"QuotaExceededError","message":"Failed to execute 'write' on 'FileSystemSyncAccessHandle': No space available for this operation"}] | ok |
| DELETE | 1 | 1 | COMMIT: SQLITE_ERROR: sqlite3 result code 1: cannot rollback - no transaction is active | [{"op":"write","path":"/crash-bcf433ea-be73-4349-94a7-f4932a84ad4c","offset":33550336,"length":8192,"name":"QuotaExceededError","message":"Failed to execute 'write' on 'FileSystemSyncAccessHandle': No space available for this operation"}] | ok |
| DELETE | 2 | 1 | COMMIT: SQLITE_ERROR: sqlite3 result code 1: cannot rollback - no transaction is active | [{"op":"write","path":"/crash-849b0b3f-1669-40e4-a873-6b6454f992d0","offset":33550336,"length":8192,"name":"QuotaExceededError","message":"Failed to execute 'write' on 'FileSystemSyncAccessHandle': No space available for this operation"}] | ok |
| DELETE | 3 | 1 | COMMIT: SQLITE_ERROR: sqlite3 result code 1: cannot rollback - no transaction is active | [{"op":"write","path":"/crash-1a463af7-4670-4b31-8dfb-b561c85ce849","offset":33550336,"length":8192,"name":"QuotaExceededError","message":"Failed to execute 'write' on 'FileSystemSyncAccessHandle': No space available for this operation"}] | ok |

## Cross-browser stop summary

| Browser / source | Row | Journal | Process-stop pass rate | Random-stop pass rate |
| --- | --- | --- | --- | --- |
| chrome / results.chrome.json | sqlite-sahpool | WAL | 10/10 (100.0%) | 30/30 (100.0%) |
| chrome / results.chrome.json | sqlite-sahpool | DELETE | 10/10 (100.0%) | 30/30 (100.0%) |
| chrome / results.chrome.json | opfs-shipped | control | 10/10 (100.0%) | 28/30 (93.3%) |
| firefox / results.firefox.json | sqlite-sahpool | WAL | 10/10 (100.0%) | 30/30 (100.0%) |
| firefox / results.firefox.json | sqlite-sahpool | DELETE | 10/10 (100.0%) | 22/30 (73.3%) |
| firefox / results.firefox.json | opfs-shipped | control | 9/10 (90.0%) | 25/30 (83.3%) |
| safari / results.safari-reload.json | sqlite-sahpool | WAL | not measured | 0/10 (0.0%) |
| safari / results.safari-reload.json | sqlite-sahpool | DELETE | not measured | 0/10 (0.0%) |
| safari / results.safari-reload.json | opfs-shipped | control | not measured | 0/10 (0.0%) |
| safari / results.safari.json | sqlite-sahpool | WAL | not measured | 0/30 (0.0%) |
| safari / results.safari.json | sqlite-sahpool | DELETE | not measured | 0/30 (0.0%) |
| safari / results.safari.json | opfs-shipped | control | not measured | 0/30 (0.0%) |
| webkit / results.webkit-process.json | sqlite-sahpool | WAL | 10/10 (100.0%) | not measured |
| webkit / results.webkit-process.json | sqlite-sahpool | DELETE | 10/10 (100.0%) | not measured |
| webkit / results.webkit-process.json | opfs-shipped | control | 10/10 (100.0%) | not measured |
| chrome / results.windows-chrome.json | sqlite-sahpool | WAL | 10/10 (100.0%) | 40/40 (100.0%) |
| chrome / results.windows-chrome.json | sqlite-sahpool | DELETE | 10/10 (100.0%) | 40/40 (100.0%) |
| chrome / results.windows-chrome.json | opfs-shipped | control | 10/10 (100.0%) | 37/40 (92.5%) |

## Diagnostic traces (not scored)

- `results.safari-diag.json` — step-by-step trace; open the JSON directly.
<!-- generated:end -->

## Findings (2026-09-18)

These are measured, not inferred from build success. Scoring: every trial reopens the database in a
fresh worker (or, for process/reload cells, a fresh process/page) and compares against the acked set
the page held before the stop; `ok` = no acked transaction lost and integrity clean.

**1. Process-stop (scored first) and random-stop.** On a real process kill (SIGKILL, fresh relaunch)
SQLite over opfs-sahpool is perfect in both journal modes on every platform measured: Chrome 10/10,
Firefox 10/10, WebKit 10/10, Windows Chrome 10/10, WAL and DELETE alike. The shipped OPFS filesystem
engine — the incumbent — is the one that loses acked data: 1/10 `partial` on a Firefox process kill,
and on random worker stops 2/30 `lost` (Chrome), 5/30 lost-or-unopenable (Firefox), 3/40 `lost`
(Windows). This is the durability gap the research doc argued, now reproduced: the incumbent drops
transactions it had already acknowledged; SQLite-WAL does not. SQLite random-stop pass rates: WAL
30/30 on Chrome and Firefox and 40/40 on Windows; DELETE 30/30 on Chrome and 40/40 on Windows but
**22/30 on Firefox**, the eight failures all `SQLITE_CORRUPT` — see the next point.

**2. Boundaries, and the one real gap: DELETE journal mode.** Seven of the eight VFS boundaries are
clean in every browser: WAL page-write, WAL commit-flush-before-checkpoint, **WAL mid-checkpoint**,
journal-after-write, journal-after-flush-before-db-write, db-after-write-before-flush, and
journal-before-delete all score `ok` 10/10 with and without a forced page-cache spill (`cache_size =
-64`). The exception is **`db-mid-commit` in DELETE (rollback-journal) mode**: terminating the worker
mid-way through the main-file commit write leaves a database that reopens as `SQLITE_CORRUPT`,
deterministically — 10/10 at the fitting cache size on Chrome, Firefox and Windows (the one `ok` seen
was a trial whose transaction was tiny enough that the commit was a single write). The rollback
journal is present and carries SQLite's magic header on disk, yet recovery still fails. Cache spill
did not change any outcome; it only shifted when pages reach OPFS. **WAL has no equivalent failure**
because a torn checkpoint re-applies from the intact `-wal` (that is exactly what `wal-mid-checkpoint`
proves). Conclusion: ship WAL, never the rollback journal. `db-mid-commit` is not a mark against
SQLite; it is a mark against DELETE mode on OPFS. Random process kills almost never hit this
microsecond window (hence the 100% process-stop rates), but Firefox random *worker* stops hit it 8/30,
so it is not merely theoretical.

**3. Quota and pool exhaustion.** Pool exhaustion is clean everywhere: filling a capacity-6 pool
raises `SQLITE_CANTOPEN` with the message "SAH pool is full" (not corruption), every already-open
database still passes `integrity_check` and its ledger, and `addCapacity(4)` then lets the next open
succeed — 3/3 on Chrome, Firefox and Windows. Quota exhaustion is survived in **both** journal modes.
When temporary-storage quota is exhausted mid-workload the failing OPFS write throws
`QuotaExceededError` ("No space available for this operation") — on the `-wal` file in WAL mode, on the
main database file in DELETE mode — and SQLite surfaces it on the `COMMIT` as result code 1
(`SQLITE_ERROR`, "cannot rollback - no transaction is active"), **not** `SQLITE_FULL`/code 13. No
acknowledged transaction is lost. Once quota is raised and a **fresh** session is opened, the database
reopens cleanly with integrity intact and every acked row present: WAL 3/3 and DELETE 3/3 on both
Chrome (~0.1 s reopen) and Windows/NTFS (~2.4 s, consistent with the runner's cold-open cost). The
`sah.write` DOM error is the modern `QuotaExceededError` shape — the research doc's warning about
Chrome returning a bare oversized integer did not reproduce on Chrome 154. Firefox quota is **not
reported**: its pref-file quota reset (Firefox exposes no CDP quota override) does not reliably restore
quota on relaunch, so Firefox reopens under residual quota pressure (90–112 s, some harness timeouts,
no data loss when a trial completes) — a harness measurement limitation, not a Firefox storage defect;
Chrome and Windows carry the answer. (An earlier draft reported "WAL fails to reopen after quota on
Chrome/Windows"; that was a harness defect — the reopen ran concurrently with the original, still-open
session instead of after it had closed. Corrected and re-measured.)

**4. Handle ceiling, and the Safari "252" folklore.** No per-origin ceiling appeared below 2,048
sync access handles on Chrome, Firefox or Windows — the probe hit its own 2,048 cap with every handle
open. The widely-repeated "252 on Safari" figure remains **unconfirmed**: real Safari could not be
measured here because the ceiling probe runs after the churning cells that wedge Safari's OPFS (see
below), so it opened only one handle before the context was already poisoned. Run the ceiling probe
first in a fresh Safari to get that number. It should not bite WCPOS regardless: sahpool holds a
handful of slots per database, not one per row. The `Worker.terminate()` latency probe confirms the
boundary mechanism: a spinning worker gets ~2 s of grace on Chrome/Windows and ~6 ms on Firefox, but
a worker blocked in `Atomics.wait` — which is how the harness holds at a boundary — dies **instantly**
(0 ms), so the stop lands exactly at the named boundary.

**5. WebKit / Safari: a browsing-context recovery limit, not a storage defect.** The in-page cells
(A,B,E,F) and the reload cell (G) show 0% on real Safari, but this is **not** data loss. The sanity
trace (`results.safari-diag.json`) proves sahpool works perfectly in Safari 26.6 when driven one
worker at a time — install, write, read, close, reopen in a fresh worker after 0 ms and after 3 s all
`ok`, WAL and DELETE. What Safari does not do is release a worker's OPFS access handles back to the
**same browsing context** after that worker is terminated while holding an open `SyncAccessHandle`;
every later worker in that page then fails with `UnknownError: Invalid platform file handle`, and a
same-tab `location.reload()` does not clear it. Only a full process relaunch — a new browsing context
— recovers, which is exactly what a real crash gives. The isolated WebKit process-stop confirms this:
10/10 `ok` in both journal modes and the control. So for the iPad/Safari tills the durability answer
is the same as elsewhere (survives a crash-and-relaunch); the caveat is architectural — **in-tab
recovery is not possible on WebKit; recovery must be a reload/relaunch**. To score real-Safari process
durability directly, run `safari-external-stops.sh` (documented above), which kills and relaunches
Safari itself; it was not run here because it repeatedly force-quits the operator's Safari.

**Net.** On the scenario the ticket says to score first — a real process crash — SQLite-over-OPFS with
WAL kept every acknowledged transaction on Chrome, Firefox, Playwright WebKit and Windows/NTFS, where
the shipped filesystem engine did not. The only corruption SQLite showed is confined to DELETE journal
mode under a mid-commit stop, which WAL avoids by construction; quota exhaustion is survived in both
modes. Open items for a follow-up: a first-party Safari handle-ceiling number, and a direct
real-Safari process-kill run (`safari-external-stops.sh`) to replace the WebKit-engine inference.
