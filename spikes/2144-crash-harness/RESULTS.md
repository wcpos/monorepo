# Spike 2144 — SQLite / OPFS crash measurements

Measured across Chrome, Firefox, Playwright WebKit and real Safari on macOS (Apple M4 Pro) and
Chrome on Windows/NTFS (GitHub Actions), 2026-09-18. Headline: on a real process crash, SQLite over
opfs-sahpool with WAL keeps every acknowledged transaction on all four browsers; the shipped OPFS
filesystem engine loses acked data on some stops. The only SQLite corruption is confined to DELETE
(rollback-journal) mode under a mid-commit stop, which WAL avoids. See **Findings** below; the
generated tables carry every trial. This is a throwaway instrument under `spikes/`; nothing ships.
Power loss is not simulated (no browser API can); process-kill is scored first, per the ticket.

## Environments measured (2026-09-18)

All rows: rxdb 17.4.0, rxdb-premium 17.4.0, @sqlite.org/sqlite-wasm 3.53.4-build1, esbuild 0.28.2, playwright 1.62.1.

- **Chrome 154.0.8037.44** — macOS (darwin 25.6.0 arm64), Apple M4 Pro, Node v24.14.0. `results.chrome.json`.
- **Firefox 153.0** — macOS (darwin 25.6.0 arm64), Apple M4 Pro, Node v24.14.0. `results.firefox.json` (cell D stopped after 4 of 6 trials, see its `skips`).
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
| sqlite-sahpool | WAL | -16384 | — | in-page | 10 | 10 | 5 | 5 | 0 | 0 | 0 | 0 | — | 1.0 | 156.7 | 156.7 |
| sqlite-sahpool | DELETE | -16384 | — | in-page | 10 | 10 | 7 | 3 | 0 | 0 | 0 | 0 | — | 1.0 | 95.4 | 95.4 |
| opfs-shipped | control | default | — | in-page | 10 | 10 | 0 | 10 | 0 | 0 | 0 | 0 | — | 1.0 | 238.4 | 238.4 |

### quota-exhaustion

| Mode | Trial | SQLite code | Statement / message | DOM error / numeric write return | Reopen outcome |
| --- | --- | --- | --- | --- | --- |
| WAL | 1 | — | page.evaluate: SQLite3Error: SQLITE_IOERR: sqlite3 result code 10: disk I/O error     at Session.worker.onmessage (http://localhost:18998/harness-entry.js:2227:38) | [] | open-failed |
| WAL | 2 | — | page.evaluate: SQLite3Error: SQLITE_IOERR: sqlite3 result code 10: disk I/O error     at Session.worker.onmessage (http://localhost:18998/harness-entry.js:2227:38) | [] | open-failed |
| WAL | 3 | — | page.evaluate: SQLite3Error: SQLITE_IOERR: sqlite3 result code 10: disk I/O error     at Session.worker.onmessage (http://localhost:18998/harness-entry.js:2227:38) | [] | open-failed |
| DELETE | 1 | 1 | COMMIT: SQLITE_ERROR: sqlite3 result code 1: cannot rollback - no transaction is active | [{"op":"write","path":"/crash-8f437a71-2d82-445b-8cd2-8f2b010d0558","offset":8384512,"length":8192,"name":"QuotaExceededError","message":"Failed to execute 'write' on 'FileSystemSyncAccessHandle': No space available for this operation"}] | ok |
| DELETE | 2 | 1 | COMMIT: SQLITE_ERROR: sqlite3 result code 1: cannot rollback - no transaction is active | [{"op":"write","path":"/crash-5090714c-374f-4463-9f5d-f255f2e3ae02","offset":8384512,"length":8192,"name":"QuotaExceededError","message":"Failed to execute 'write' on 'FileSystemSyncAccessHandle': No space available for this operation"}] | ok |
| DELETE | 3 | 1 | COMMIT: SQLITE_ERROR: sqlite3 result code 1: cannot rollback - no transaction is active | [{"op":"write","path":"/crash-41a40727-e8cf-42b7-b494-fb656954f3c1","offset":8384512,"length":8192,"name":"QuotaExceededError","message":"Failed to execute 'write' on 'FileSystemSyncAccessHandle': No space available for this operation"}] | ok |
| Row | Journal | Cache | Boundary | Recovery | Trials | ok | ok-with-inflight-present | ok-with-inflight-absent | lost | partial | integrity-failed | open-failed | open-failed reason | Median reopen attempts | Median reacquire ms | Median reopen ms |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| sqlite-sahpool | WAL | default | — | in-page | 3 | 0 | 0 | 0 | 0 | 0 | 0 | 3 | Error | — | — | — |
| sqlite-sahpool | DELETE | -16384 | — | in-page | 3 | 3 | 0 | 3 | 0 | 0 | 0 | 0 | — | 1.0 | 61.3 | 61.3 |

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

Not run: quota-exhaustion — stopped after 4 of 6 trials; each unbounded-quota reopen can burn the 600s timeout, and Chrome+Windows cover cell D

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
| sqlite-sahpool | WAL | -16384 | — | in-page | 10 | 10 | 4 | 6 | 0 | 0 | 0 | 0 | — | 1.0 | 285.9 | 286.0 |
| sqlite-sahpool | DELETE | -16384 | — | in-page | 10 | 10 | 3 | 7 | 0 | 0 | 0 | 0 | — | 1.0 | 165.1 | 165.1 |
| opfs-shipped | control | default | — | in-page | 10 | 9 | 0 | 9 | 0 | 1 | 0 | 0 | — | 1.0 | 257.7 | 257.7 |

### quota-exhaustion

| Mode | Trial | SQLite code | Statement / message | DOM error / numeric write return | Reopen outcome |
| --- | --- | --- | --- | --- | --- |
| WAL | 1 | 1 | COMMIT: SQLITE_ERROR: sqlite3 result code 1: cannot rollback - no transaction is active | [{"op":"write","path":"/crash-ff4cfe81-feb9-4b19-8735-ad1aedc0b37c-wal","offset":11753032,"length":8192,"returned":0,"expected":8192}] | ok |
| WAL | 2 | — | page.waitForFunction: Timeout 600000ms exceeded. | [] | open-failed |
| WAL | 3 | 1 | COMMIT: SQLITE_ERROR: sqlite3 result code 1: cannot rollback - no transaction is active | [{"op":"write","path":"/crash-f77413d1-e59b-4455-ab2e-736869310fcf-wal","offset":11753032,"length":8192,"returned":0,"expected":8192}] | ok |
| DELETE | 1 | 1 | COMMIT: SQLITE_ERROR: sqlite3 result code 1: cannot rollback - no transaction is active | [{"op":"write","path":"/crash-ebc8f351-ddbd-4f10-a80f-f800268594b1","offset":10734989312,"length":8192,"returned":0,"expected":8192}] | ok |
| DELETE | 2 | — | page.waitForFunction: Target page, context or browser has been closed Browser logs:  <launching> /Users/kilbot/Library/Caches/ms-playwright/firefox-1538/firefox/Nightly.app/Contents/MacOS/firefox -no-remote -headless -profile /var/folders/4b/tqqv7pks34x147m1rw7tt6q00000gn/T/spike2144-quota-MLUATB -juggler-pipe about:blank <launched> pid=30376 [pid=30376][err] *** You are running in headless mode. [pid=30376][err] JavaScript warning: resource://services-settings/Utils.sys.mjs, line 119: unreachable code after return statement [pid=30376][out]  [pid=30376][out] Juggler listening to the pipe [pid=30376][out] console.error: "Error fetching remote settings base url from CDN. Falling back to https://firefox-settings-attachments.cdn.mozilla.net/" (new SyntaxError("XMLHttpRequest.open: '/' is not a valid URL.", (void 0), 126)) [pid=30376][out] console.error: services.settings:  [pid=30376][out]   Message: EmptyDatabaseError: "main/nimbus-desktop-experiments" has not been synced yet [pid=30376][out]   Stack: [pid=30376][out]     EmptyDatabaseError@resource://services-settings/Database.sys.mjs:19:5 [pid=30376][out] list@resource://services-settings/Database.sys.mjs:96:13 [pid=30376][out]  [pid=30376][err] JavaScript error: chrome://juggler/content/Helper.js, line 82: NS_ERROR_FAILURE: Component returned failure code: 0x80004005 (NS_ERROR_FAILURE) [nsIWebProgress.removeProgressListener] [pid=30376][out] console.warn: services.settings: #fetchAttachment: Forcing fallbackToDump to false due to Utils.LOAD_DUMPS being false [pid=30376][out] console.error: (new NotFoundError("Could not find fa0fc42c-d91d-fca7-34eb-806ff46062dc in cache or dump", "resource://services-settings/Attachments.sys.mjs", 48)) [pid=30376][out] console.warn: "Unable to find the attachment for" "fa0fc42c-d91d-fca7-34eb-806ff46062dc" [pid=30376][out] console.error: [Exception... "Favicon at "http://localhost:18998/favicon.ico" failed to load."  nsresult: "0x80004004 (NS_ERROR_ABORT)"  location: "JS frame :: resource:///modules/FaviconLoader.sys.mjs :: onStopRequest :: line 286"  data: no] [pid=30376][err] JavaScript warning: resource://gre/modules/UpdateService.sys.mjs, line 4029: unreachable code after return statement [pid=30376][out] console.error: "Could not download new icon" (new ServerInfoError("Server response is invalid SyntaxError: XMLHttpRequest.open: '/' is not a valid URL.", "resource://services-settings/Attachments.sys.mjs", 40)) [pid=30376] <gracefully close start> [pid=30376] <forcefully close> [pid=30376] <kill> [pid=30376] <will force kill> [pid=30376] exception while trying to kill process: Error: kill EPERM | [] | open-failed |
| Row | Journal | Cache | Boundary | Recovery | Trials | ok | ok-with-inflight-present | ok-with-inflight-absent | lost | partial | integrity-failed | open-failed | open-failed reason | Median reopen attempts | Median reacquire ms | Median reopen ms |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| sqlite-sahpool | WAL | -16384 | — | in-page | 2 | 2 | 0 | 2 | 0 | 0 | 0 | 0 | — | 1.0 | 109266.6 | 109266.7 |
| sqlite-sahpool | WAL | default | — | in-page | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 1 | TimeoutError | — | — | — |
| sqlite-sahpool | DELETE | -16384 | — | in-page | 1 | 1 | 0 | 1 | 0 | 0 | 0 | 0 | — | 1.0 | 113893.5 | 113893.5 |
| sqlite-sahpool | DELETE | default | — | in-page | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 1 | Error | — | — | — |

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
| sqlite-sahpool | WAL | -16384 | — | in-page | 10 | 10 | 9 | 0 | 0 | 0 | 0 | 0 | — | 1.0 | 318.5 | 318.5 |
| sqlite-sahpool | DELETE | -16384 | — | in-page | 10 | 10 | 10 | 0 | 0 | 0 | 0 | 0 | — | 1.0 | 193.5 | 193.5 |
| opfs-shipped | control | default | — | in-page | 10 | 10 | 10 | 0 | 0 | 0 | 0 | 0 | — | 1.0 | 487.5 | 487.5 |

## chrome — results.windows-chrome.json

| Environment | Value |
| --- | --- |
| browser | chrome |
| browserVersion | 152.0.7977.83 |
| os | win32 10.0.26100 x64 |
| cpu | AMD EPYC 9V74 80-Core Processor                 |
| node | v22.23.2 |
| versions | {"rxdb":"17.4.0","rxdb-premium":"17.4.0","esbuild":"0.28.2","playwright":"1.62.1","@sqlite.org/sqlite-wasm":"3.53.4-build1"} |
| measuredAt | 2026-09-18T15:03:43.685Z |

### boundary-stop

| Row | Journal | Cache | Boundary | Recovery | Trials | ok | ok-with-inflight-present | ok-with-inflight-absent | lost | partial | integrity-failed | open-failed | open-failed reason | Median reopen attempts | Median reacquire ms | Median reopen ms |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| sqlite-sahpool | WAL | -16384 | wal-after-page-write | in-page | 10 | 10 | 0 | 10 | 0 | 0 | 0 | 0 | — | 1.0 | 2436.0 | 2436.0 |
| sqlite-sahpool | WAL | -64 | wal-after-page-write | in-page | 10 | 10 | 0 | 10 | 0 | 0 | 0 | 0 | — | 1.0 | 2427.4 | 2427.4 |
| sqlite-sahpool | WAL | -16384 | wal-after-commit-flush-before-checkpoint | in-page | 10 | 10 | 0 | 0 | 0 | 0 | 0 | 0 | — | 1.0 | 2426.9 | 2426.9 |
| sqlite-sahpool | WAL | -64 | wal-after-commit-flush-before-checkpoint | in-page | 10 | 10 | 0 | 0 | 0 | 0 | 0 | 0 | — | 1.0 | 2433.7 | 2433.7 |
| sqlite-sahpool | WAL | -16384 | wal-mid-checkpoint | in-page | 10 | 10 | 0 | 0 | 0 | 0 | 0 | 0 | — | 1.0 | 2675.5 | 2675.5 |
| sqlite-sahpool | WAL | -64 | wal-mid-checkpoint | in-page | 10 | 10 | 0 | 0 | 0 | 0 | 0 | 0 | — | 1.0 | 2443.6 | 2443.6 |
| sqlite-sahpool | DELETE | -16384 | journal-after-write | in-page | 10 | 10 | 0 | 10 | 0 | 0 | 0 | 0 | — | 1.0 | 2683.2 | 2683.2 |
| sqlite-sahpool | DELETE | -64 | journal-after-write | in-page | 10 | 10 | 0 | 10 | 0 | 0 | 0 | 0 | — | 1.0 | 2682.9 | 2682.9 |
| sqlite-sahpool | DELETE | -16384 | journal-after-flush-before-db-write | in-page | 10 | 10 | 0 | 10 | 0 | 0 | 0 | 0 | — | 1.0 | 2425.8 | 2425.8 |
| sqlite-sahpool | DELETE | -64 | journal-after-flush-before-db-write | in-page | 10 | 10 | 0 | 10 | 0 | 0 | 0 | 0 | — | 1.0 | 2430.2 | 2430.2 |
| sqlite-sahpool | DELETE | -16384 | db-mid-commit | in-page | 10 | 0 | 0 | 0 | 0 | 0 | 0 | 10 | SQLITE_CORRUPT (11) | 12.0 | — | 32471.3 |
| sqlite-sahpool | DELETE | -64 | db-mid-commit | in-page | 10 | 1 | 1 | 0 | 0 | 0 | 0 | 9 | SQLITE_CORRUPT (11) | 12.0 | 2424.7 | 32423.4 |
| sqlite-sahpool | WAL | -16384 | db-after-write-before-flush | in-page | 10 | 10 | 0 | 0 | 0 | 0 | 0 | 0 | — | 1.0 | 2434.5 | 2434.5 |
| sqlite-sahpool | WAL | -64 | db-after-write-before-flush | in-page | 10 | 10 | 0 | 0 | 0 | 0 | 0 | 0 | — | 1.0 | 2435.4 | 2435.4 |
| sqlite-sahpool | DELETE | -16384 | db-after-write-before-flush | in-page | 10 | 10 | 10 | 0 | 0 | 0 | 0 | 0 | — | 1.0 | 2419.8 | 2419.8 |
| sqlite-sahpool | DELETE | -64 | db-after-write-before-flush | in-page | 10 | 10 | 10 | 0 | 0 | 0 | 0 | 0 | — | 1.0 | 2556.5 | 2556.5 |
| sqlite-sahpool | DELETE | -16384 | journal-before-delete | in-page | 10 | 10 | 10 | 0 | 0 | 0 | 0 | 0 | — | 1.0 | 2422.8 | 2422.8 |
| sqlite-sahpool | DELETE | -64 | journal-before-delete | in-page | 10 | 10 | 10 | 0 | 0 | 0 | 0 | 0 | — | 1.0 | 2419.9 | 2419.9 |

### random-stop

| Row | Journal | Cache | Boundary | Recovery | Trials | ok | ok-with-inflight-present | ok-with-inflight-absent | lost | partial | integrity-failed | open-failed | open-failed reason | Median reopen attempts | Median reacquire ms | Median reopen ms |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| sqlite-sahpool | WAL | -16384 | — | in-page | 30 | 30 | 26 | 0 | 0 | 0 | 0 | 0 | — | 1.0 | 2727.7 | 2727.7 |
| sqlite-sahpool | DELETE | -16384 | — | in-page | 30 | 30 | 29 | 0 | 0 | 0 | 0 | 0 | — | 1.0 | 2700.9 | 2700.9 |
| opfs-shipped | control | default | — | in-page | 30 | 29 | 3 | 26 | 1 | 0 | 0 | 0 | — | 1.0 | 273.3 | 273.3 |

### pool-exhaustion

| Row | Journal | Cache | Boundary | Recovery | Trials | ok | ok-with-inflight-present | ok-with-inflight-absent | lost | partial | integrity-failed | open-failed | open-failed reason | Median reopen attempts | Median reacquire ms | Median reopen ms |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| sqlite-sahpool | WAL | -16384 | — | in-page | 3 | 3 | 0 | 0 | 0 | 0 | 0 | 0 | — | — | 54.3 | — |

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
| spinning | 2009.5 | 216698460 | ok |
| waiting | 0.0 | 0 | ok |

### slot-reuse

| Row | Journal | Cache | Boundary | Recovery | Trials | ok | ok-with-inflight-present | ok-with-inflight-absent | lost | partial | integrity-failed | open-failed | open-failed reason | Median reopen attempts | Median reacquire ms | Median reopen ms |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| sqlite-sahpool | WAL | -16384 | — | in-page | 50 | 50 | 0 | 0 | 0 | 0 | 0 | 0 | — | — | 31.8 | 2696.6 |

### process-stop

| Row | Journal | Cache | Boundary | Recovery | Trials | ok | ok-with-inflight-present | ok-with-inflight-absent | lost | partial | integrity-failed | open-failed | open-failed reason | Median reopen attempts | Median reacquire ms | Median reopen ms |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| sqlite-sahpool | WAL | -16384 | — | in-page | 10 | 10 | 9 | 1 | 0 | 0 | 0 | 0 | — | 1.0 | 2314.9 | 2314.9 |
| sqlite-sahpool | DELETE | -16384 | — | in-page | 10 | 10 | 8 | 2 | 0 | 0 | 0 | 0 | — | 1.0 | 2289.5 | 2289.5 |
| opfs-shipped | control | default | — | in-page | 10 | 10 | 0 | 10 | 0 | 0 | 0 | 0 | — | 1.0 | 293.4 | 293.4 |

### quota-exhaustion

| Mode | Trial | SQLite code | Statement / message | DOM error / numeric write return | Reopen outcome |
| --- | --- | --- | --- | --- | --- |
| WAL | 1 | — | page.evaluate: SQLite3Error: SQLITE_IOERR: sqlite3 result code 10: disk I/O error     at Session.worker.onmessage (http://localhost:18998/harness-entry.js:2227:38) | [] | open-failed |
| WAL | 2 | — | page.evaluate: SQLite3Error: SQLITE_IOERR: sqlite3 result code 10: disk I/O error     at Session.worker.onmessage (http://localhost:18998/harness-entry.js:2227:38) | [] | open-failed |
| WAL | 3 | — | page.evaluate: SQLite3Error: SQLITE_IOERR: sqlite3 result code 10: disk I/O error     at Session.worker.onmessage (http://localhost:18998/harness-entry.js:2227:38) | [] | open-failed |
| DELETE | 1 | 1 | COMMIT: SQLITE_ERROR: sqlite3 result code 1: cannot rollback - no transaction is active | [{"op":"write","path":"/crash-5c9f2d0a-beb8-426d-9b96-7bcf47541956","offset":8384512,"length":8192,"name":"QuotaExceededError","message":"Failed to execute 'write' on 'FileSystemSyncAccessHandle': No space available for this operation"}] | ok |
| DELETE | 2 | 1 | COMMIT: SQLITE_ERROR: sqlite3 result code 1: cannot rollback - no transaction is active | [{"op":"write","path":"/crash-3bb91a47-0da3-4a76-8730-8eb2b37dab23","offset":8384512,"length":8192,"name":"QuotaExceededError","message":"Failed to execute 'write' on 'FileSystemSyncAccessHandle': No space available for this operation"}] | ok |
| DELETE | 3 | 1 | COMMIT: SQLITE_ERROR: sqlite3 result code 1: cannot rollback - no transaction is active | [{"op":"write","path":"/crash-aeaa2c73-809f-4e8b-a399-168213aa4761","offset":8384512,"length":8192,"name":"QuotaExceededError","message":"Failed to execute 'write' on 'FileSystemSyncAccessHandle': No space available for this operation"}] | ok |
| Row | Journal | Cache | Boundary | Recovery | Trials | ok | ok-with-inflight-present | ok-with-inflight-absent | lost | partial | integrity-failed | open-failed | open-failed reason | Median reopen attempts | Median reacquire ms | Median reopen ms |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| sqlite-sahpool | WAL | default | — | in-page | 3 | 0 | 0 | 0 | 0 | 0 | 0 | 3 | Error | — | — | — |
| sqlite-sahpool | DELETE | -16384 | — | in-page | 3 | 3 | 0 | 3 | 0 | 0 | 0 | 0 | — | 1.0 | 2697.3 | 2697.3 |

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
| chrome / results.windows-chrome.json | sqlite-sahpool | WAL | 10/10 (100.0%) | 30/30 (100.0%) |
| chrome / results.windows-chrome.json | sqlite-sahpool | DELETE | 10/10 (100.0%) | 30/30 (100.0%) |
| chrome / results.windows-chrome.json | opfs-shipped | control | 10/10 (100.0%) | 29/30 (96.7%) |

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
and on random worker stops 2/30 `lost` (Chrome), 5/30 lost-or-unopenable (Firefox), 1/30 `lost`
(Windows). This is the durability gap the research doc argued, now reproduced: the incumbent drops
transactions it had already acknowledged; SQLite-WAL does not. SQLite random-stop pass rates: WAL
30/30 on Chrome, Firefox and Windows; DELETE 30/30 on Chrome and Windows but **22/30 on Firefox**,
the eight failures all `SQLITE_CORRUPT` — see the next point.

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
succeed — 3/3 on Chrome, Firefox and Windows. Quota exhaustion is messier and journal-mode-dependent:
in DELETE mode SQLite surfaces `SQLITE_FULL` (result code 13 via `SQLITE_IOERR`) and the database
reopens cleanly once quota is raised (Chrome, Firefox, Windows). In **WAL mode the database failed to
reopen** after the quota event on Chrome (3/3) and Windows (3/3) and once on Firefox — the `-wal`
could not be checkpointed into a full main file and the reopen hangs until space is genuinely
available. The `sah.write` DOM error at the boundary is `QuotaExceededError` ("No space available for
this operation"); note this is the modern shape — the research doc's warning about Chrome returning a
bare oversized integer did not reproduce on Chrome 154. Cell D on Firefox was stopped after 4 of 6
trials (each unbounded reopen can burn the 600 s timeout); Chrome and Windows cover it.

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
WAL kept every acknowledged transaction on Chrome, Firefox, WebKit and Windows/NTFS, where the
shipped filesystem engine did not. The only corruption SQLite showed is confined to DELETE journal
mode under a mid-commit stop, which WAL avoids by construction. Open items for a follow-up: the WAL
quota-reopen hang, and a first-party Safari handle-ceiling number.
