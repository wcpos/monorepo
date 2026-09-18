# Behaviour ledger: `numpad`

Seeded 2026-09-18 from `.claude/research/2026-09-12-component-behaviour-ledger.md` on `research/component-ledger` (wcpos/roadmap#285) by wcpos/roadmap#345. Numbers are assigned once and never reused: a struck line leaves a gap, a new line takes the next number. Every line keeps its evidence. The rules for preserving or striking a line are in the [library strategy](https://github.com/wcpos/roadmap/blob/worktree-docs%2Bdesign-program-2026-09-12/docs/design/2026-09-18-library-strategy.md), section 3. Not reworded from the source.

**Job:** A numeric-entry keypad with a text display, sign switching, decimal entry and optional percentage discounts.

**Base:** `react-native` (`TextInput`, `View`), `lodash/toNumber` and local input/button components; no split. DOM selection support is checked through `"webInput?.selectionStart !== undefined"` and optional `setSelectionRange` calls.

## Lines

1. Delays initial focus and text selection by 50 ms to work around unreliable autofocus — evidence: code: "@FIXME - the autofocus doesn't seem to work, perhaps it's not on the screen yet?" in `packages/components/src/numpad/index.tsx:45`.
2. Runs initial selection only on mount so the third digit does not overwrite the preceding digits — evidence: `bcda913d84 2026-02-07 fix: numpad resets after 2 digits due to useEffect re-firing on value length change`.
3. Guards DOM-only selection APIs on native TextInput refs — evidence: `3558dbabf1 2026-04-04 fix(pr277): restore corrupted numpad and fix pulse-row destructuring`, PR #277, code: "webInput?.setSelectionRange?.(0, 100);" in `packages/components/src/numpad/index.tsx:53`.
4. Refocuses the display and moves the web cursor to the end after keypad presses — evidence: `44c3b60978 2024-11-04 Fix numpad UI`, code: "// after a button press, we want to focus the input" in `packages/components/src/numpad/index.tsx:205`.
5. Gives the locale-dependent decimal key a locale-independent test identifier — evidence: code: "testID={value === decimalSeparator ? 'numpad-key-decimal' : undefined}" in `packages/components/src/numpad/index.tsx:246`.
6. Gives icon-only keys stable identifiers so the sign-toggle key is addressable — evidence: `e513ffcb69 2026-08-24 fix(order-math): line taxes follow WooCommerce's storage contract (#1533)`, PR #1533, code: "const keyId = label ?? (icon ? `icon-${icon}` : undefined);" in `packages/components/src/numpad/index.tsx:89`.
