# Behaviour ledger: `pos/products/cells`

Seeded 2026-09-18 from `.claude/research/2026-09-18-composed-behaviour-ledger.md` on `research/composed-ledger` (wcpos/roadmap#341) by wcpos/roadmap#345. Numbers are assigned once and never reused: a struck line leaves a gap, a new line takes the next number. Every line keeps its evidence. The rules for preserving or striking a line are in the [library strategy](https://github.com/wcpos/roadmap/blob/worktree-docs%2Bdesign-program-2026-09-12/docs/design/2026-09-18-library-strategy.md), section 3. Not reworded from the source.

**Job:** Render product and variation table cells and their cart actions.

**Composes:** `@wcpos/components/{icon-button,popover,text,vstack}`.

## Lines

1. Product and variation display names decode HTML entities — WooCommerce names can arrive encoded — evidence: `name.tsx:31` and `variation-name.tsx:30`, “Sometimes the product name from WooCommerce is encoded in html entities” — platform: all.
2. Variation names are composed from their own attributes rather than trusting served names — older plugins collapse three-plus-attribute variations to indistinguishable parent titles — evidence: `d0a4e6b58a 2026-08-25 fix(pos): compose the variation row name from its own attributes (#1589)` — platform: all.
3. Variation cart metadata passes through the shared sanitizer — malformed attributes must not break manual addition — evidence: `5d454f4101 2026-08-17 fix(core): sanitize variation cart attributes`; test name: `variation-actions.test.tsx`, “drops malformed variation attributes before building cart metadata” — platform: all.
4. Metadata displays only configured keys and decodes its rendered content — the products pane and cart must not show the same metadata differently — evidence: `meta-data.tsx:23`, “Filter the product meta data to only show the keys set in UI Settings”; `meta-data.tsx:42–43`, “The cart decodes this same meta once the product is added; the grid showing it encoded made one value read two ways on one screen.” — platform: all.
5. Variable-action triggers read Stock Status before entering the popover and pass it explicitly — native portal content has no products query-provider ancestor — evidence: `a2a461f39f 2026-08-27 fix(pos): variation popover reads the Stock Status pill at the trigger site (#1606)` — platform: iOS/Android; shared implementation also used on web/Electron.
