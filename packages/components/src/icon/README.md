# Icons

`Icon` uses generic `IconName` values from `scripts/icons/vocabulary.json`.
`IconSetProvider set="phosphor"` selects a static set for its children; without a provider,
the default is `tabler`. Unknown dynamic names render the active set's `alert` glyph.

Three families ship: `tabler` (width-1.5 strokes, the default), `hugeicons` and `phosphor`.
Run `pnpm --filter @wcpos/components svg` from the repository root to regenerate names,
SVGs, and React Native components. `scripts/icons/maps/` defines each family's glyphs and
cross-family borrows; the WCPOS mark is `brand:wcpos`, drawn once in `scripts/icons/brand/`.
The build fetches pinned Iconify collections. Each generated SVG directory has a
`LICENSE.md`, including borrowed sources.
