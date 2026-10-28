# Behaviour ledger: `tone-disc`

Created 2026-10-28 by the component-library programme (slice W2-F, appendix A of the 2026-10-28 architecture review: "tone disc — inside GateScreen only, 2 hand copies at 11/14/24"). Numbers are assigned once and never reused; every line keeps its evidence.

**Job:** The round tone mark a state leads with: a wash and one glyph, by meaning.

**Not its job:** a status dot (`StatusBadge`), a count (`Badge`), an avatar, or the pre-theme gate's disc (`gate-screen/pre-theme.tsx` draws its own in StyleSheet numbers, above the providers).

**Base:** React Native `View`, `Icon`.

## Lines

1. Four tones, each a wash and a glyph ink from the `-bg` token family: `ok` (`bg-ok-bg`, `text-ok`, check), `warning` (`bg-warning-bg`, `text-warning-text`, warning), `bad` (`bg-bad-bg`, `text-bad`, alert), `muted` (`bg-muted`, `text-muted-foreground`, info); `icon` overrides the tone's glyph — evidence: `gate-screen` lines 3 and 11 (the tones were GateScreen's); `index.test.tsx` "paints the %s tone as a wash and its own glyph".
2. One size scale, disc and glyph together: `sm` 44 (beside a sheet's title, the closure sheet), `default` 56 (a gate, a completed printer setup), `lg` 96 (the sale's paid stamp) — evidence: the three hand copies it replaced (`pos/cart/closure-sheet.tsx` `size-11`, `settings/printer/setup/printer-setup-dialog.tsx` and `gate-screen` `size-14`, `pos/checkout/receipt-stage/receipt-stage.tsx` `size-24`); `index.test.tsx` "sizes the disc and its glyph together".
3. The paid stamp's washes moved from `bg-success/15` / `bg-warning/15` to the disc's `bg-ok-bg` / `bg-warning-bg`, and its check from the default glyph to the `lg` glyph, as one scale requires — evidence: `receipt-stage.test.tsx` and `apps/main/e2e/checkout-offline-tender.spec.ts` assert the new washes.
4. The tones, washes, inks and glyphs are the tone map's `disc`, `text` and `glyph` faces, and `bad` is ONE red with the destructive action: `--bad: var(--destructive)` in every theme (card 16, 2026-10-28, orchestrator's ruling for Paul to confirm). The second red it replaced, to restore in one line per theme if the lighter red is wanted back: light `--bad: oklch(0.58 0.2 25)`; dark, ocean, sunset and monochrome `--bad: oklch(0.68 0.18 25)`. The `warn`, `warn-text` and `warn-bg` tokens folded into `warning`, `warning-text` and `warning-bg` — evidence: card 16 of the 2026-10-28 component-library review (`lib/tone.ts`), test `lib/tone.test.ts`; `scripts/theme-token-contract.test.mjs`.
