# Spike 2144 — SQLite / OPFS crash measurements

No browser measurements have been made by the builder. Build, syntax checks and synthetic hook
replays do not establish durability, compatibility, speed, power-loss safety, or browser support.

## Environment placeholders

- Chrome: TODO browser version, OS, CPU, Node, package versions, measuredAt.
- Firefox: TODO browser version, OS, CPU, Node, package versions, measuredAt.
- Playwright WebKit: TODO browser version, OS, CPU, Node, package versions, measuredAt.
- Real Safari: TODO Safari version, macOS, CPU (fill manually; page cannot identify it), packages, measuredAt; Node is not applicable.
- Windows Chrome: TODO browser version, OS, CPU, Node, package versions, measuredAt.

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
No browser measurements yet. Filled by `node report.mjs` when `results.*.json` exist.

## Cross-browser stop summary

| Browser / source | Row | Journal | Process-stop pass rate | Random-stop pass rate |
| --- | --- | --- | --- | --- |
<!-- generated:end -->

## Operator answers (do not infer these from build/self-test success)

1. **Process/random pass rates:** TODO compare SQLite WAL/DELETE with the control per browser,
   prioritizing process stops. Note missing cells, incomplete runs, and sample sizes.
2. **Boundaries / cache spill:** TODO identify non-ok boundaries and whether the 64 KiB cache
   changed outcomes. Check dry traces and reachability before interpreting storage failures.
3. **Quota / pool exhaustion:** TODO report actual SQLite/DOM errors, pool-full behavior,
   addCapacity recovery, and reopen outcomes.
4. **Handle ceiling:** TODO report counts/exceptions per browser and state whether a real Safari
   measurement exists; a Playwright WebKit result is not a Safari number.
