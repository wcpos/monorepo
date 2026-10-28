# Behaviour ledger: `tile-grid`

Created 2026-10-28 by card 17 of the component-library review. Numbers are assigned once and never reused: a struck line leaves a gap, a new line takes the next number. Every line keeps its evidence.

**Job:** Tiles in fixed columns: columns in, equal cells out (CODING_STANDARDS § Design 4).

**Not its job:** the virtualised products grid (`pos/products/tiles/tile-grid.tsx` keeps its own list and shares `chunk`).

**Base:** `react-native` View.

## Lines

1. Every row has `columns` cells (`min-w-0 flex-1`), a short last row padded with empty ones, so a tile's width never follows its label; rows and cells are 8 apart (`gap-2`, the between-controls gutter) — evidence: card 17 (the chunk-and-pad loop was written in the tender pane, the register count, the recount sheet and the theme settings, with three spacer recipes); test "columns in, equal cells out…".
2. A fragment among the children is its tiles, so a caller's conditional pair (the split pane's Half and Custom) fills two cells — evidence: card 17, the split pane; same test.
3. `chunk(items, columns)` is the one row arithmetic, shared with the virtualised products grid — evidence: card 17; test "chunks items into rows…".
