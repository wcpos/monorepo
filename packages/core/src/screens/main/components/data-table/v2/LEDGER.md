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
