# Cart strip centred scroll

## Changed

- Replaced whole-tab windows, arrows and off-stage measurement with a horizontal ScrollView: content-sized tabs, clamped centring, native snap offsets and reduced-motion support.
- Added billing-name/Guest-content headings, chip-or-age sublines with one strip clock, and non-open warning/error tray dots.
- Bounded mounted carts to 25 either side plus receipts; retained ordering, keyboard navigation, the New cell and list/receipt/scope behavior.
- Added helper/component coverage and ledger decision 84. Source diff: 299 added non-test lines, below the 350-line estimate and brief ceiling. Existing `pnpm-lock.yaml` changes were not edited or staged.

## Verification — Observed

Baseline: prescribed test command, before edits, exit 0; 5 suites / 59 tests passed.
Final command (exit 0):

```sh
NODE_OPTIONS=--max-old-space-size=4096 pnpm --filter @wcpos/core test src/screens/main/pos/cart/tabs.test.tsx src/screens/main/pos/cart/tab-window.test.ts src/screens/main/pos/cart/tab-who.test.ts src/screens/main/pos/cart/tab-chip.test.tsx src/screens/main/pos/cart/open-orders-position.test.tsx src/screens/main/pos/cart/open-orders-list.test.tsx --maxWorkers=2
```

Output tail:
```text
Test Suites: 6 passed, 6 total
Tests:       69 passed, 69 total
Snapshots:   0 total
Time:        23.926 s
```

The prescribed bare typecheck and lint commands both exhausted the inherited 2 GB Node heap (exit 134, SIGABRT):
```text
Allocation failed - JavaScript heap out of memory
```
Both passed after a command-local memory increase, without configuration changes:
```sh
NODE_OPTIONS=--max-old-space-size=4096 pnpm --filter @wcpos/core typecheck
NODE_OPTIONS=--max-old-space-size=4096 pnpm --filter @wcpos/core lint
```
Output tails (both exit 0):
```text
$ tsc --noEmit

✖ 132 problems (0 errors, 132 warnings)
  0 errors and 2 warnings potentially fixable with the `--fix` option.
```
No lint warnings are in edited files. Commands also warn that installed dependencies and the existing lockfile are out of sync; no installation was performed.

`pnpm translations:check` passed: “Translation source strings are complete.” `git diff --check` passed.

## Decisions

- Kept `pos_cart.tab_cart`: the app's columns navigation and phone tab layout still use it. Removed only the unused previous/next keys.
- “Off the row” dots cover clipped mounted tabs; distant carts beyond the explicit mount cap do not gain subscriptions. The warning dot names both waiting categories using existing translations.
- Selecting New scrolls to the content end: its selected cell remains outside the scroller.
- The centring effect synchronizes external selection and layout with imperative scrolling; its documented lint exception avoids duplicating that synchronization across handlers.

## Behavior changes / regressions

Intentional: clipped scrolling replaces arrows; who replaces the headline amount; age replaces generic “Cart”; terminal waiting is warning-toned; exception dots summarize non-open mounted carts. No regression was observed in the named suites; this is not a broad compatibility claim.

Not evaluated: visual/device behavior, E2E, native swipe feel, or performance. No screenshots or gallery were produced, as requested. RN-web snapping is intentionally not polyfilled.
