# Behaviour ledger: `toast`

Seeded 2026-09-18 from `.claude/research/2026-09-12-component-behaviour-ledger.md` on `research/component-ledger` (wcpos/roadmap#285) by wcpos/roadmap#345. Numbers are assigned once and never reused: a struck line leaves a gap, a new line takes the next number. Every line keeps its evidence. The rules for preserving or striking a line are in the [library strategy](https://github.com/wcpos/roadmap/blob/worktree-docs%2Bdesign-program-2026-09-12/docs/design/2026-09-18-library-strategy.md), section 3. Not reworded from the source.

**Job:** A shared imperative toast API and toaster export covering native/web libraries and legacy callers.

**Base:** `sonner-native` in `sonner.tsx`; `sonner` in **`sonner.web.tsx`**. This is the folder’s platform split; no `Platform.OS` or `Platform.select` branches.

## Lines

1. Converts shared `type` options into native `variant` options — evidence: `c1008a4d9b 2025-08-08 update logging to toast`, code: "Convert type to variant for sonner-native compatibility" in `packages/components/src/toast/sonner.tsx:9`.
2. Preserves legacy `text1`/`text2`, dismiss-button, and action options through the newer toast API — evidence: `cda47034a1 2025-08-07 update toast library`, code: "Legacy interface for backward compatibility" in `packages/components/src/toast/index.ts:14`.
3. Dispatches supported web toast types through Sonner’s typed methods to retain semantic colours — evidence: `b273497a94 2026-08-29 fix(components): keep toast colours on web after the sonner 2.0.8 bump`, dependency-bump reference #1594, code: "`return sonnerToast[type](message, rest);`" in `packages/components/src/toast/sonner.web.tsx:24`.
4. Treats unsupported runtime web types as plain toasts instead of calling nonexistent Sonner methods — evidence: `da1ff91794 2026-08-29 fix(components): guard unsupported web toast types`, code: "`return sonnerToast(message, rest);`" in `packages/components/src/toast/sonner.web.tsx:26`.
5. Exposes toast IDs for workflows that update one existing toast instead of creating successive notifications — evidence: `463acde555 2026-07-17 feat(core): scan-feedback module — one updating toast per scan + engine-outage banner`, issue/spec #722, code: "Returns the toast id; passing the same `id` option again updates that toast in place." in `packages/components/src/toast/index.ts:43`.
6. Supplies semantic default test IDs while preserving caller-provided IDs — evidence: `86f64ac608 2026-08-27 feat(sync): protocol signal, boundary tolerances, and the update-required gate UX (#1602)`, PR #1602, code: "`testId: options.testId ?? `${type ?? 'default'}-toast`,`" in `packages/components/src/toast/index.ts:73`.
