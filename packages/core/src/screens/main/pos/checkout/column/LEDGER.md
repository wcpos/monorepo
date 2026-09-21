# Behaviour ledger: `pos/checkout/column`

Seeded 2026-09-18 from `.claude/research/2026-09-18-composed-behaviour-ledger.md` on `research/composed-ledger` (wcpos/roadmap#341) by wcpos/roadmap#345. Numbers are assigned once and never reused: a struck line leaves a gap, a new line takes the next number. Every line keeps its evidence. The rules for preserving or striking a line are in the [library strategy](https://github.com/wcpos/roadmap/blob/worktree-docs%2Bdesign-program-2026-09-12/docs/design/2026-09-18-library-strategy.md), section 3. Not reworded from the source.

**Job:** Host tender or receipt content in the products column and own checkout-specific back navigation.

**Composes:** `@wcpos/components/{button,hstack,icon,tabs,text}`.

## Lines

1. Back closes split selection first, asks about live manual payments, but lets a terminal leg continue in the background — terminal cancellation belongs to its own payment controls — evidence: `checkout-column.tsx:40`, “A live terminal leg is never hidden behind another view”; `e81a5fe335 2026-09-08 fix(checkout): background capture never switches the screen; cancel waits for an in-flight intent` — platform: all.
2. Handle Android hardware Back only while mounted; leave Escape to prevented events, editable fields and open dialogs, and do not use Escape to finish a receipt — checkout must not steal another interaction’s dismissal key — evidence: `c28f97b32b 2026-09-07 fix(checkout): review round on the column swap`; named back-navigation tests — platform: Android; web, Electron for Escape.
3. Render a title skeleton while an optimistic save has no order number — do not display a fabricated order number while the server assigns one — evidence: `c305605f97 2026-09-08 feat(pos): open checkout optimistically while the order saves (#1911)`; test “shows a title skeleton while saving an unnumbered order” — platform: all.
4. Explicitly make the payment tabs horizontal — the primitive does not supply a row direction on web — evidence: `checkout-column.tsx:99`, “TabsList sets no direction of its own; on web a View defaults to a column.” — platform: web, Electron.
