# Behaviour ledger: `pos/cart/cells/edit-shipping-line`

Seeded 2026-09-18 from `.claude/research/2026-09-18-composed-behaviour-ledger.md` on `research/composed-ledger` (wcpos/roadmap#341) by wcpos/roadmap#345. Numbers are assigned once and never reused: a struck line leaves a gap, a new line takes the next number. Every line keeps its evidence. The rules for preserving or striking a line are in the [library strategy](https://github.com/wcpos/roadmap/blob/worktree-docs%2Bdesign-program-2026-09-12/docs/design/2026-09-18-library-strategy.md), section 3. Not reworded from the source.

**Job:** Edit shipping method, amount, tax status and metadata without inventing line-level tax configuration.

**Composes:** `@wcpos/components/{dialog,form,hstack,tabs,text,tree}`.

## Lines

1. Never expose or submit a shipping tax class, but retain tax status and tax-inclusion intent — WooCommerce uses the store’s shipping class while the POS plugin honours line tax status — evidence: `pos/cart/cells/edit-shipping-line/form.tsx:36–39`, “No tax class field — same reason as the Add shipping dialog”; `58b5c0b79e 2026-08-24 fix(order-math): the shipping tax class is the STORE's, never the line's` — platform: all.
2. Keep form/JSON tabs scrollable inside the side-panel layout, with actions pinned separately — a long shipping payload must not move Save outside the panel — evidence: `a49db27e0b 2026-09-11 feat(pos): overlays slide in from the products side, opposite the cart (#1985)` — platform: all.
