# Behaviour ledger: `pos/cart/cells/edit-fee-line`

Seeded 2026-09-18 from `.claude/research/2026-09-18-composed-behaviour-ledger.md` on `research/composed-ledger` (wcpos/roadmap#341) by wcpos/roadmap#345. Numbers are assigned once and never reused: a struck line leaves a gap, a new line takes the next number. Every line keeps its evidence. The rules for preserving or striking a line are in the [library strategy](https://github.com/wcpos/roadmap/blob/worktree-docs%2Bdesign-program-2026-09-12/docs/design/2026-09-18-library-strategy.md), section 3. Not reworded from the source.

**Job:** Edit fee intent, taxation and metadata while retaining JSON inspection.

**Composes:** `@wcpos/components/{dialog,form,hstack,tabs,text,tree,vstack}`.

## Lines

1. Submit edited `meta_data` with the fee mutation — the form previously displayed metadata controls but discarded their changes — evidence: `pos/cart/cells/edit-fee-line/form.tsx:101–103`, “the cashier's meta edits went nowhere”; `8640bbfcf4 2026-08-23 refactor(pos): route fee lines through calculateCartLine, delete the second copy` — platform: all.
2. Reject negative edited fee amounts — new discounts belong to coupon intent, not negative-fee authoring — evidence: `4a561a1d83 2026-09-09 feat(pos): Add Discount writes a quick-discount coupon line; negative fees leave the till; coupons are Free`; test `pos/cart/add-discount.test.tsx`: “rejects negative fees in the %s form” — platform: all.
3. Preserve percentage/tax-inclusion basis and translate standard tax class through the shared codec — editing must retain fee intent while sending WooCommerce’s empty-string standard class — evidence: `d470418c2d 2026-08-19 refactor(core): one owner for the WooCommerce tax_class 'standard' ⇄ '' quirk`; `8640bbfcf4 2026-08-23 refactor(pos): route fee lines through calculateCartLine, delete the second copy` — platform: all.
4. Observe percentage mode with `useWatch`, and keep the footer outside the scrolling form/JSON content — avoids compiler opt-out and preserves reachable actions in panels — evidence: `58e60a9707 2026-09-02 refactor(forms): useWatch instead of form.watch so the React Compiler stops skipping forms`; `a49db27e0b 2026-09-11 feat(pos): overlays slide in from the products side, opposite the cart (#1985)` — platform: all.
