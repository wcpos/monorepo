# Behaviour ledger: `pos/contexts/order-engine-warnings`

Seeded 2026-09-18 from `.claude/research/2026-09-18-composed-behaviour-ledger.md` on `research/composed-ledger` (wcpos/roadmap#341) by wcpos/roadmap#345. Numbers are assigned once and never reused: a struck line leaves a gap, a new line takes the next number. Every line keeps its evidence. The rules for preserving or striking a line are in the [library strategy](https://github.com/wcpos/roadmap/blob/worktree-docs%2Bdesign-program-2026-09-12/docs/design/2026-09-18-library-strategy.md), section 3. Not reworded from the source.

**Job:** Retain per-order arithmetic warnings and emit actionable, deduplicated diagnostics.

**Composes:** none directly.

## Lines

1. Give malformed price basis and unknown tax rate distinct codes — their remedies differ: replace the line versus investigate a deleted rate — evidence: `index.tsx:29–30`, “They carry separate error codes because the merchant's response” / “differs — re-add that line, versus ask the admin about a deleted tax rate.” — platform: all.
2. Use the existing inline totals-warning surface rather than a toast on each mutation — a bad line must remain visible before payment without repeatedly interrupting edits — evidence: `index.tsx:34–40`, “These fire per line mutation, so one bad line would re-toast on every edit”; “the cashier-facing half rides the cart's” / “existing "the amounts on this order may not be right" surface” — platform: all.
3. Accumulate warning kinds in stable order and keep them after subsequent quiet settles — aggregate settling cannot rediscover every malformed line basis, so clearing on silence would hide the original defect — evidence: `index.tsx:47–50`, “`settleAggregate` sees line items only through their persisted totals”; “A set that cleared on the next settle would therefore flash and vanish” — platform: all.
4. Log once per order/code/detail rather than occurrence, allowing distinct bad tax IDs their own entries; bound remembered log keys — repeated keystrokes must not bury surrounding diagnostics — evidence: `index.tsx:92–95`, “One log line per (order, code, detail), not per occurrence.”; “The” / “detail is part of the key so a SECOND unknown rate id still gets its own entry.” — platform: all.
5. Cap retained order details at fifty by last report, refreshing recency even for repeated warnings — insertion-order eviction could remove the warning on the sale currently being edited — evidence: `960c7dd85e 2026-08-25 fix(pos): evict held engine warnings by last report, not first` — platform: all.
6. Keep UUID-less warnings log-only, key retained warnings by globally unique order UUID and return inert defaults without a provider — advisory reporting must neither attach to the wrong cart nor break standalone screens — evidence: `index.tsx:53–55`, “entries are keyed by” / “order uuid, which is unique per order across stores”; `5525f48055 2026-08-25 fix(pos): give order-math warnings one sink, and a cashier surface`; named provider-less test — platform: all.
