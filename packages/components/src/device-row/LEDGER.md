# Behaviour ledger: `device-row`

Created 2026-10-28 by card 10 of the 2026-10-28 component-library review ("Rows and cards"). Numbers are assigned once and never reused: a struck line leaves a gap, a new line takes the next number. Every line keeps its evidence.

**Job:** One device in a settings list: the card readers, the Tap to Pay offer, printers, receipt templates, scanners and paired customer displays.

**Not its job:** a setting (`property-row`), a flush list row (`list-row`), a choice in a picker (`list-item`, `menu-row`).

**Base:** `card` (`padding="row"`), `icon`, `badge`, `status-badge` (`caption`), `progress`, `text` (the ladder), the tone map.

## Lines

1. The shape CODING_STANDARDS § Rows and cards describes: a card; a 40 icon square; line 1 the name at the `dialog` rank (16 semibold) with a muted `Badge` tag at the right edge; line 2 the identifiers joined by a middle dot, blanks dropped, at the `key` rank; line 3 ONE state line, a caption `StatusBadge`; then the children, with the actions last on their own full-width row (`DeviceRowActions`). Stacked lines, never a wrap — evidence: the six hand copies it replaced (`settings/card-readers/reader-row.tsx`, `card-readers/index.tsx` TapToPayRow, `printing/printer-row.tsx`, `printing/template-row.tsx`, `barcode-scanning/input-sources.tsx` ScannerProfileRow, `customer-display/paired-displays.tsx` DisplayRow); the record-row name ruled 16 as written, not `text-lg` as built (orchestrator, 2026-10-28); test "stacks the name and its tag…" in `index.test.tsx`.
2. The icon square is tinted by the state line: `ok` and `bad` colour it, every other state (and none) is muted, so only a live link or a failure earns colour — evidence: the reader row's `error ? destructive : connected ? success : muted` tile and the scanner row's "Only a live link earns colour"; test "tints the icon square by the state".
3. A known bar shows its value and a missing value is an unknown wait (`indeterminate`); the icon square spins while `busy` — evidence: the reader row's firmware install bar and scan spinner; test "names a caller state testID, spins the square while busy…".
4. Test ids derive from the row's: `-tag`, `-identifiers`, `-state` (a caller may name the state line's own, as the reader row keeps `-status` and `-line`), `-progress` — evidence: `apps/main/e2e/checkout-device.spec.ts` (`reader-row-…-status`); tests in `settings/card-readers/index.test.tsx`.
