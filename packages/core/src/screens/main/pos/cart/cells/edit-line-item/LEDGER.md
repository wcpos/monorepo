# Behaviour ledger: `pos/cart/cells/edit-line-item`

Seeded 2026-09-18 from `.claude/research/2026-09-18-composed-behaviour-ledger.md` on `research/composed-ledger` (wcpos/roadmap#341) by wcpos/roadmap#345. Numbers are assigned once and never reused: a struck line leaves a gap, a new line takes the next number. Every line keeps its evidence. The rules for preserving or striking a line are in the [library strategy](https://github.com/wcpos/roadmap/blob/worktree-docs%2Bdesign-program-2026-09-12/docs/design/2026-09-18-library-strategy.md), section 3. Not reworded from the source.

**Job:** Edit cart product data and inspect the underlying line JSON.

**Composes:** `@wcpos/components/{dialog,form,hstack,tabs,text,tree,vstack}`; type from `lib/use-hierarchy`.

## Lines

1. Accept variation attribute metadata without mandatory `key`/`value`, preserving `attr_id` and display fields through the shared schema — normal variation lines previously failed Save silently — evidence: `ba4840d51b 2026-03-23 fix(cart): meta_data schema rejects variation attributes, breaking Save on edit modal`, fixes `#215`; test `form-schema.test.ts`: “should preserve attr_id through parsing” — platform: all.
2. Show virtual/downloadable/category controls only for miscellaneous lines, and seed tax status from its actual value — ordinary catalog lines must not acquire misc-only flags; both tax-status strings are truthy — evidence: `313fa8351f 2026-03-25 fix: scope misc product fields, fix tax_status bug` — platform: all.
3. Preserve category IDs/names through the hierarchical multi-category form and translate standard tax class through the shared codec — selected categories and wire tax identity must survive editing — evidence: `254447a933 2026-03-26 feat: composable TreeCombobox with category tree filtering`; `d470418c2d 2026-08-19 refactor(core): one owner for the WooCommerce tax_class 'standard' ⇄ '' quirk` — platform: all.
4. Keep form/JSON tabs flex-constrained with scrolling bodies and a sibling Save footer — long metadata must not hide the action when the editor becomes a panel — evidence: `a49db27e0b 2026-09-11 feat(pos): overlays slide in from the products side, opposite the cart (#1985)` — platform: all.
