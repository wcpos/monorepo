`v2/` folded into this directory on 2026-10-15; read `v2/x` as `x`

Seeded 2026-09-18 from `.claude/research/2026-09-18-composed-behaviour-ledger.md` on `research/composed-ledger` (wcpos/roadmap#341) by wcpos/roadmap#345. Numbers are assigned once and never reused: a struck line leaves a gap, a new line takes the next number. Every line keeps its evidence. The rules for preserving or striking a line are in the [library strategy](https://github.com/wcpos/roadmap/blob/worktree-docs%2Bdesign-program-2026-09-12/docs/design/2026-09-18-library-strategy.md), section 3. Not reworded from the source.

1. preserved — v2/index.tsx
2. preserved — v2/index.tsx
3. preserved — v2/index.tsx
4. preserved — v2/index.tsx
5. preserved — v2/index.tsx
6. preserved — v2/rows.tsx
7. preserved — v2/index.tsx
8. preserved — v2/index.tsx
9. preserved — v2/index.tsx
10. preserved — v2/rows.tsx
11. preserved — v2/index.tsx
12. preserved — v2/index.tsx
13. preserved — v2/skeleton.tsx
14. preserved — footer.tsx, untouched
15. preserved — footer.tsx, untouched
16. preserved — footer.tsx, untouched
17. preserved — footer.tsx, untouched
18. preserved — footer.tsx, untouched
19. Every table, its skeleton and the POS tile grids sit on one shared surface (`../surface.tsx`): a `bg-card` card with a hairline border and one radius, inset by the filter chips' 8 pt so their edges align; the phone runs edge to edge under a hairline instead. The surface lives inside `v2/index.tsx` and `v2/skeleton.tsx`, not in each screen, so Orders, Products, Customers, Coupons and the POS pane cannot drift — evidence: owner's pick from the 2026-10-05 mockups (`~/Projects/wcpos-handoffs/orders-table-variants-2026-10-05.html`, variant 2 of four; cart left as it was); verified in the running app on the local Metro, list and tiles — platform: all.
20. The surface's inset follows the container's density, not the chips' 8 pt of line 19: `gutter="page"` (`mx-4 mb-4`) on the management list pages, whose chip row is `p-4` and Customers' body `pt-4`, so search, chips and card share the 16 edge; `dense` (the default, `mx-2 mb-2`) in the POS pane. The card never owns its top margin, so one gutter sits between chips and card and the pending-search line still spans the pane; the phone is unchanged — evidence: owner, 2026-10-18 (list pages lose the bar title); CODING_STANDARDS § Design, Gutters; `surface.test.tsx` — platform: all.
21. The caption row's text lines up with the cells' by the same gutter: its mount wraps it in `CaptionRowInset` (`surface.tsx`), the card's gutter plus the cell's 12 — `px-5` dense, `px-7` page — and no footer component (`DataTableFooter`, the POS `ProductsFooter`) pads itself. The POS mounts outside DataTable (`HandleProductsFooter`, the tile grid's footer) take the dense inset, so the POS stays at 20 — evidence: line 20's page gutter left the list pages' caption 4 px off the cells (2026-10-19); `surface.test.tsx`, `index.test.tsx` — platform: all.

## Query-handle compat removal (added 2026-10-13)

`DataTable` takes a query handle only (`StreamDataTable` and the `resource`/`active$`/`total$`/`sync` props are deleted). Lines 14–18 now live in `v2/footer.tsx`, which takes values and defines the footer contract (`DataTableFooterProps`), and in `v2/index.tsx`’s `HandleFooter`, which reads the live handle’s `active` and the drawn handle’s `total`. The default footer is `v2/footer.tsx`’s caption row again: from `b583312e1` (2026-10-12) to this change the handle source drew the (now deleted) bordered `footer.tsx` row by default, against line 19’s single caption row (`v2/index.test.tsx`, “the default footer is the caption row”).

22. The caption row carries the gutter below it (`pb-4` on a page, `pb-2` in a dense pane; none on the phone, whose screen pads the home indicator): the pane's bottom edge is a container edge like its top, and the row had sat flush on it while the card above kept 16 — evidence: owner, 2026-10-20 ("consistent, including at the bottom"); CODING_STANDARDS § Design, Gutters; `surface.test.tsx` — platform: all.
23. The band under the card is 2 units + the caption row + the page gutter (8 + 24 + 12 at Regular, 10 + 30 + 15 at Spacious). The caption row is the card's own control strip, not a content area, so the card sits 2 units above it (`TableSurface` `mb-2`; `TileGround` `pb-1` plus the tile's own 4), the Gutters table's "between controls" 8; the row has no height of its own: its content's (the `xs` sync button, 6 units, the `fine` pointer floor; its press band keeps the 44 touch target past the row, icon-button ledger line 7), and the skeleton holds the same 6. It had been gutter + `min-h-ctl` + gutter (12 + 44 + 12 at Regular, 82 at Spacious), a control-row height for a caption with two page gutters around it — evidence: owner, 2026-10-23 ("too much white space at the bottom", confirmed at 15 + 40 + 15 after the first cut); CODING_STANDARDS § Design, Gutters; `surface.test.tsx` — platform: all.
24. The phone caption row takes the screen edge's 16 (`px-1` plus the cell's 12), as the bar and the chip row above it do, sits 2 units under the edge-to-edge list (`mb-2` on the phone card, as on the desktop) and carries the page gutter above the tab bar or the home-indicator inset; it had sat at 12 with no gutter on either side — evidence: owner, 2026-10-23 ("there is no padding on the footer row"); CODING_STANDARDS § Design, Gutters (the phone's screen edge); `surface.test.tsx` — platform: phone. _(supersedes line 22's phone clause, "none on the phone")_

## One footer (added 2026-10-28, component-library card 9)

25. The POS products caption row IS `DataTableFooter`: the footer takes a `label` (replacing the count sentence; the raw `data-table-loaded-count` / `data-table-total-count` markers stay the numbers) and a caption child, and `pos/products/footer.tsx` hands it the products' sentence ("16 products", a level's prefix) and the tax notice. Its copy of the row had dropped the `data-table-caption-row` testID; one row now carries it on every list — evidence: `footer.test.tsx`, "takes a label for the sentence and a caption child, in the one caption row". A pane's own numbers reach it through `OwnFooterContext` (`pos/products/footer.tsx`); the `OwnFooter` pass-through is deleted.
