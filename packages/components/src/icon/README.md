# Icons

`Icon` uses generic `IconName` values from `scripts/icons/vocabulary.json`.
`IconSetProvider set="phosphor"` selects a static set for its children; without a provider,
the default is `tabler`. Unknown dynamic names render the active set's `alert` glyph.

Run `pnpm --filter @wcpos/components svg` from the repository root to regenerate names,
SVGs, and React Native components. `scripts/icons/maps/` defines each family's glyphs and
cross-family borrows; `tabler-2` shares the Tabler map but keeps width-2 strokes.
The build fetches pinned Iconify collections and reads byte-preserved Font Awesome Pro
sources from `scripts/icons/fontawesome-solid/`. Each generated SVG directory has a
`LICENSE.md`, including borrowed sources and Solar's attribution.
