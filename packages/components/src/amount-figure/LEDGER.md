# Behaviour ledger: `amount-figure`

Created 2026-10-28 by card 7 of the component-library architecture review (`~/Projects/wcpos-handoffs/architecture-review-component-library-2026-10-28.html`). Numbers are assigned once and never reused: a struck line leaves a gap, a new line takes the next number. Every line keeps its evidence.

**Job:** The figure a screen leads with: the tender entry, the split and balance headlines, the amount on the terminal, the paid moment, the register panel's drawer figure, the closure tiles, and the movement sheet's figure typed in place.

**Not its job:** a row of a summary (`money-list`); editing an amount (`core/.../components/amount-field`); a count that is not money.

**Base:** `Text` (`caption` rank for the eyebrow), `class-variance-authority`. Interface: `AmountFigure` (`size`, `tone`, `eyebrow`, `center`, Text's props) and `amountFigure({ size, tone })`, the class string for a TextInput that cannot be wrapped.

## Lines

1. Three steps and no others: `hero` `text-amt` (the `--text-amt` token, 40), `headline` `text-2xl` (the same lead figure in a compact pane), `tile` `text-xl` (one figure among equals, the closure tiles). Always `font-bold tabular-nums`. They replace six sizes: the terminal's `text-7xl`/`text-5xl`, the balance's `text-4xl`/`text-2xl`, three sites that wrote `text-amt` by hand and the tiles' `text-xl` — evidence: card 7; `apps/main/global.css` `--text-amt`; CODING_STANDARDS § Design 1 and 3; test `amount-figure.test.tsx`.
2. `tone` is the foreground unless it carries meaning (`destructive` for a short count, `success`); a caller's `className` is layout or state only (the tender entry's `opacity-70` while it shows the suggested amount) — evidence: CODING_STANDARDS § Design 7; test scale matrix.
3. `eyebrow` is one caption above the figure in the ladder's `caption` rank ("Total", "Remaining", "On the terminal"); `center` centres the figure and its eyebrow together on a centred stage — evidence: `checkout/tender/ledger-pane.tsx` `BalanceHeadline`, `terminal-leg-view.tsx`, `receipt-stage.tsx`; tests "sets the eyebrow…", "centres it with its eyebrow…".
4. The register panel's figure is its dialog title: `DialogTitle asChild` slots the heading role onto the figure, and the figure's step wins over the dialog title's — evidence: `pos/cart/register-panel.tsx`; test `pos/cart/register-panel.test.tsx`.
