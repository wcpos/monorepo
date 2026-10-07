# Behaviour ledger: `pos/products/v2`

Seeded 2026-09-18 from `.claude/research/2026-09-18-composed-behaviour-ledger.md` on `research/composed-ledger` (wcpos/roadmap#341) by wcpos/roadmap#345. Numbers are assigned once and never reused: a struck line leaves a gap, a new line takes the next number. Every line keeps its evidence. The rules for preserving or striking a line are in the [library strategy](https://github.com/wcpos/roadmap/blob/worktree-docs%2Bdesign-program-2026-09-12/docs/design/2026-09-18-library-strategy.md), section 3. Not reworded from the source.

## pos/products

1. preserved — v2/index.tsx
2. preserved — v2/index.tsx
3. preserved — v2/index.tsx
4. preserved — v2/index.tsx
5. preserved — v2/index.tsx
6. preserved — v2/index.tsx
7. preserved — v2/index.tsx
8. preserved — v2/index.tsx
9. preserved — v2/footer.tsx
10. preserved — use-fit-page-size.ts, untouched
11. preserved — use-fit-page-size.ts, untouched
12. preserved — ui-settings-form.tsx, Variations row added
13. preserved — v2/index.tsx
14. preserved — v2/index.tsx
15. preserved — use-product-meta-keys.ts, untouched
16. preserved — meta-data-keys-field.tsx, untouched
17. preserved — meta-data-keys-field.tsx, untouched
18. preserved — storage-outage-banner.tsx, untouched
19. preserved — v2/index.tsx

## pos/products/cells

1. preserved — cells/name.tsx and cells/variation-name.tsx, untouched; v2/rows/variation-row.tsx
2. preserved — v2/rows/variation-row.tsx; cells/variation-name.tsx, untouched
3. preserved — v2/rows/variation-row.tsx; cells/variation-actions.tsx, untouched
4. preserved — cells/meta-data.tsx, untouched
5. preserved — cells/variable-actions.tsx, untouched (inline)

## pos/products/grid

1. preserved — grid/index.tsx, tile props added
2. preserved — grid/index.tsx, tile props added
3. preserved — grid/index.tsx, tile props added; grid/grid-footer.tsx, untouched
4. preserved — grid/index.tsx, tile props added
5. preserved — grid/grid-footer.tsx, untouched
6. preserved — grid/index.tsx, tile props added
7. preserved — v2/grid/product-tile.tsx; grid/variable-product-tile.tsx, untouched (inline)
8. preserved — v2/grid/product-tile.tsx; grid/variable-product-tile.tsx, untouched (inline)
9. preserved — v2/grid/product-tile.tsx; grid/variable-product-tile.tsx, untouched (inline)
10. preserved — grid/tile-image.tsx, untouched
11. preserved — v2/grid/variable-product-tile.tsx; grid/variable-product-tile.tsx, untouched (inline)

## pos/products/filter-bar

1. preserved — v2/filter-bar.tsx; filter-bar/filter-bar-layout.ts, untouched
2. preserved — filter-bar/filter-bar-layout.ts, untouched
3. preserved — v2/filter-bar.tsx; filter-bar/apply-quick-filter.ts, untouched
4. preserved — v2/filter-bar.tsx; filter-bar/apply-quick-filter.ts, untouched
5. preserved — filter-bar/quick-filter-editor.tsx, untouched
6. preserved — filter-bar/quick-filter-editor.tsx, untouched
7. preserved — filter-bar/quick-filter-editor.tsx, untouched
8. preserved — filter-bar/quick-filter-preview.tsx, untouched
9. preserved — filter-bar/quick-filter-preview.tsx, untouched
10. preserved — filter-bar/quick-filter-preview.tsx, untouched
11. preserved — filter-bar/modal.tsx, untouched
12. preserved — filter-bar/quick-filter-editor.tsx, untouched

## Unchanged composed surfaces

`components/product` lines 1–50 and `pos/products/cells/variations-popover` lines 1–13 remain unchanged. The existing variable row and tile compose their expansion/picker under `inline`; shared product cells, menus and tax display remain imported, and the Products management page retains the old pills. No line is struck or marked n/a.

## Ruled deviations

- Resize is session-local: persistence needs a hydration rule change in `ui-settings/utils.ts`, deferred.
- The drill-in shows variations in the form the cashier came from (owner's pick from the live mockup, 2026-10-02, replacing "rows in both view modes"). In the table it is rows, a push on `PaneStack`: the products stay mounted and drift off as the pane travels over them (decision 32's motion), and nothing lands row by row (owner, 2026-10-01; decision 39's row stagger stays struck). In the grid it is tiles on the products' own columns, dealt on `deal-stack.tsx`: the tapped tile walks to the first slot and is the way back, its variations come out from under it on the `newTiles` beat and gather on `oldTiles`, and the products fade underneath and stay mounted. On the way back the products come up on the parent's whole 280 ms walk on the accelerating exit curve, not the furniture's decelerating one: with the furniture's curve they were half visible within 70 ms, in the gaps between gathering tiles, which read as a flash (owner, 2026-10-05, after trying the deal on dev-next: "very, very good" otherwise; filmed before/after in the handoff folder). Device pass 2026-10-05 (owner on iPad, agent-driven Pixel over adb): iPad clean; Android had three first-frame ordering defects — the parent painted at rest before the crumb's height was known, was thrown off-screen by an easing overshoot on the return, and left its slot empty for a frame between the lift and the copy — fixed in #2398 with tests and captures in `captures/2026-10-05-deal-android/`. Variation tiles honour the grid's display fields except category, which a variation does not have. Evidence: `@wcpos/components/pane-stack` ledger; `deal-stack.test.tsx`; `e2e/pos-variations-drill-in.spec.ts`.
- `TaxBasedOn` remains the existing hover-card display. The grid retains its own footer.
- The existing shared settings dialog and its footer Close/Restore actions are unchanged.
- Stock filtering uses the source’s `matchesStockStatusFilter` on resident variation hits; the variations query has no stock-status field. Parent variation IDs remain the footer denominator, floored at the displayed count.

## Browse by (added 2026-10-06; roadmap#392 slices 3–4)

1. The root term set (All products first, then the source's terms) and a term's level are the same tiles and rows in every state the gallery can hold still — image, plain, long name, All products, shortcut, the parent in slot 0, and the four as rows — evidence: `browse/gallery.tsx`, registered as `browse-tiles`; the shortcut tile shows `describeQuickFilter`'s sentence under its name, trimmed to two lines (`term-tile.tsx`), and a filter-only shortcut pressed at the root resets to the baseline and applies its conditions under its own crumb (`browse-stage.test.tsx`, "shortcuts: the stored quick filters are the root"). Live, store-agnostic: `e2e/pos-browse-by.spec.ts` creates a disposable root category and a probe product in it and, in grid and table, walks root → All products and back → the category → the probe under its crumb → back → a search spans the catalogue and the root returns on clear (skips with a reason when the writer credentials are not configured) — evidence: green on dev-next 2026-10-06, `deploy.yml` dispatch run 37537041907 on the branch with `lane=next`, in both projects (free-authenticated #29 and pro-authenticated #94, shard 6/6); a `next`-lane PR runs no web E2E on its own, so a dispatch is how this spec is proven. Neither the web transition nor the Pixel film of the category deal was shot in this slice; the Pixel shoot runs separately.

## In-cart count (added 2026-10-01)

1. An add lands on the product's in-cart count: the new number rolls in from below over the old one (`BEAT`), the badge swells to 1.3 in 90 ms and a loose spring settles it through a dip. There is no ring or glow: a ring splashing out of the badge was built and struck the same day (owner: "a bit too much"). A count that goes down rolls back the other way with no landing. Only `transform` and `opacity` animate; reduce-motion skips all of it — evidence: owner, 2026-10-01 ("an extra drop going into a bucket… fun, smooth, and joyful"); the badge previously appeared and changed with no motion; filmed frame by frame on web, including three adds 120 ms apart, which carry on from the bounce in flight; `rows/in-cart-count.test.tsx`. A spring asked to go from 1 to 1 with only a starting velocity did not move at all, hence the explicit swell.
2. The count stays mounted while it is zero (rendering the row's `+`, or nothing on a tile) so that it sees the first add; a count that differs because the list recycled the row for another product, or because another open order came into view, moves nothing — evidence: tests "a different product or a different order is not an add" and "shows what stands in for it while the cart holds none, and moves nothing on mount".
