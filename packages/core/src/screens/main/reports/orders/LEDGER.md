# Behaviour ledger: `reports/orders`

Seeded 2026-09-18 from `.claude/research/2026-09-18-composed-behaviour-ledger.md` on `research/composed-ledger` (wcpos/roadmap#341) by wcpos/roadmap#345. Numbers are assigned once and never reused: a struck line leaves a gap, a new line takes the next number. Every line keeps its evidence. The rules for preserving or striking a line are in the [library strategy](https://github.com/wcpos/roadmap/blob/worktree-docs%2Bdesign-program-2026-09-12/docs/design/2026-09-18-library-strategy.md), section 3. Not reworded from the source.

**Job:** Display report orders and control which orders contribute to chart and report.

**Composes:** `@wcpos/components/{card,checkbox,error-boundary,hstack,suspense,text,tooltip}`.

## Lines

1. Store excluded UUIDs and invert them into table selection — orders are included by default, including newly arriving rows — evidence: `reports/orders/index.tsx:114`, “Derive the selection state by inverting unselectedRowIds”; `reports/context.tsx:135`, “Remove unselectedRowIds from orders” — platform: all.
2. Toggle all from the exclusion set: exclude every current order when none are excluded, otherwise clear exclusions; show partial selection in the header — preserves report-wide include/exclude semantics — evidence: `reports/orders/index.tsx:152`, “All rows are selected, so we want to unselect all rows”; `:161`, “Some rows are unselected, so we want to select all rows” — platform: all.
3. Pass selection through FlashList `extraData` — checkbox changes must repaint recycled rows — evidence: `reports/orders/index.tsx:181`, “Extra data is needed to force a re-render of FlashList when the selection state changes” — platform: native FlashList path.
4. Make table limit extension a no-op — Reports already binds the complete resident date window — evidence: `reports/orders/index.tsx:106`, “Reports bind the complete resident date window up front; there is no next page.” — platform: all.
5. Preserve nullable totals through the footer instead of substituting loaded-row count — incomplete history must not claim a trustworthy denominator — evidence: `f93565dcbd 2026-08-22 fix(query): never print a denominator nothing vouches for` — platform: all.
6. Feed sorting directly from query state/actions rather than relying on TanStack’s sorting state — the former custom sorting schema broke after a library change — evidence: `685d04404f 2026-03-10 fix: remove TanStack from sorting loop — use UI settings directly`; [^query] documents the later query-state migration — platform: all.
7. Ask `column.getCanSort()` whether sorting is allowed — respects table-level disabling and display/accessor distinctions — evidence: `be063c75dd 2026-03-10 fix: address review feedback from coderabbitai`, body explicitly documents this correction — platform: all.
8. Render header definitions through `flexRender()` — function-valued headers must work, not merely string headers — evidence: `825785467a 2026-03-10 fix: address review feedback from coderabbitai`, body explicitly documents function-based templates — platform: all.
9. Forward column alignment to the shared header — stretching its press target across the cell must not lose right/centre alignment — evidence: `f2666fb5a4 2026-04-08 fix: make column header Pressable fill entire cell for reliable click targeting` — platform: all; web click-target defect.
10. Use the report-specific table skeleton inside Suspense — loading retains the expected table structure — evidence: `aaa6f4fbc9 2026-03-26 feat: use DataTableSkeleton as Suspense fallback in all table screens` — platform: all.
11. Supply shared engine-record cells through a cells map, including Register, while delegating fallback rendering — prevents report/order display drift and preserves register browsing — evidence: `f3ec0f150c 2026-08-22 refactor(data-table): take a cells map instead of a render function`; [^register] — platform: all.
