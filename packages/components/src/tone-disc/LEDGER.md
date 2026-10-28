# Behaviour ledger: `tone-disc`

Created 2026-10-28 by the component-library programme (slice W2-F, appendix A of the 2026-10-28 architecture review: "tone disc — inside GateScreen only, 2 hand copies at 11/14/24"). Numbers are assigned once and never reused; every line keeps its evidence.

**Job:** The round tone mark a state leads with: a wash and one glyph, by meaning.

**Not its job:** a status dot (`StatusBadge`), a count (`Badge`), an avatar, or the pre-theme gate's disc (`gate-screen/pre-theme.tsx` draws its own in StyleSheet numbers, above the providers).

**Base:** React Native `View`, `Icon`.

## Lines

1. Four tones, each a wash and a glyph ink from the `-bg` token family: `ok` (`bg-ok-bg`, `text-ok`, check), `warn` (`bg-warn-bg`, `text-warn-text`, warning), `bad` (`bg-bad-bg`, `text-bad`, alert), `muted` (`bg-muted`, `text-muted-foreground`, info); `icon` overrides the tone's glyph — evidence: `gate-screen` lines 3 and 11 (the tones were GateScreen's); `index.test.tsx` "paints the %s tone as a wash and its own glyph".
2. One size scale, disc and glyph together: `sm` 44 (beside a sheet's title, the closure sheet), `default` 56 (a gate, a completed printer setup), `lg` 96 (the sale's paid stamp) — evidence: the three hand copies it replaced (`pos/cart/closure-sheet.tsx` `size-11`, `settings/printer/setup/printer-setup-dialog.tsx` and `gate-screen` `size-14`, `pos/checkout/receipt-stage/receipt-stage.tsx` `size-24`); `index.test.tsx` "sizes the disc and its glyph together".
3. The paid stamp's washes moved from `bg-success/15` / `bg-warning/15` to the disc's `bg-ok-bg` / `bg-warn-bg`, and its check from the default glyph to the `lg` glyph, as one scale requires — evidence: `receipt-stage.test.tsx` and `apps/main/e2e/checkout-offline-tender.spec.ts` assert the new washes.
