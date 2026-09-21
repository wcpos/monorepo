# Behaviour ledger: `pos/cart/totals`

Seeded 2026-09-18 from `.claude/research/2026-09-18-composed-behaviour-ledger.md` on `research/composed-ledger` (wcpos/roadmap#341) by wcpos/roadmap#345. Numbers are assigned once and never reused: a struck line leaves a gap, a new line takes the next number. Every line keeps its evidence. The rules for preserving or striking a line are in the [library strategy](https://github.com/wcpos/roadmap/blob/worktree-docs%2Bdesign-program-2026-09-12/docs/design/2026-09-18-library-strategy.md), section 3. Not reworded from the source.

**Job:** Render store-configured tax summaries and the existing customer note.

**Composes:** `@wcpos/components/{hstack,icon,pressable,text,textarea,tooltip,vstack}`.

## Lines

1. In itemized tax display, combine product and shipping tax for each rate; otherwise show the aggregate, with inclusion/exclusion context — shipping tax must not vanish from the visible tax breakdown — evidence: `pos/cart/totals/taxes.tsx:34`, “tax_total and shipping_tax_total are separate, but we will display together” — platform: all.
2. Synchronize the editable note when the order’s note changes using previous-value comparison during render — avoids stale note text without a state-synchronizing effect — evidence: `pos/cart/totals/customer-note.tsx:29–31`, “Keep the textarea value in sync with order.customer_note.” — platform: all.
3. Hide empty notes; edit an existing note inline and trim/persist it on blur or submit before leaving editing — preserves the lightweight inline-note workflow — evidence: `pos/cart/totals/customer-note.tsx:41–54,70–77` _(inferred — no explicit evidence)_ — platform: all.
