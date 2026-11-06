# Behaviour ledger: `editable-field`

Seeded 2026-10-28 by card 18 of the component-library review, when the field moved here from core's `screens/main/components/editable-field.tsx` (it imports nothing from core). Numbers are assigned once and never reused: a struck line leaves a gap, a new line takes the next number. Every line keeps its evidence.

**Job:** A grid cell's name that reads as text and becomes a textarea on press.

**Base:** `Button`, `Textarea`, `Text`; the placeholder class from `property-row`.

## Lines

1. The empty value reads as the shared property placeholder in muted ink (`PROPERTY_PLACEHOLDER_CLASS`, `property-row` line 7) — evidence: `property-row/LEDGER.md` line 7 — platform: all.
2. Leaving the editor writes through `onChangeText` only when the text was edited to something other than the synced value; a focus-and-leave writes nothing — evidence: `index.test.tsx` "a blur without an edit writes nothing" (W4-H) — platform: all.
3. A ghost field at rest is the editor's box without its border: one control tall (`min-h-ctl`), the text in the middle (`justify-center`: the button is a column, so `items-start` keeps the left edge the editor and the SKU share — Codex P2 on #3231), the textarea's `py-3`; pressing it changes nothing but the border. Before, the rest was `min-h-9` with the text at the top, so the hover was smaller than the editor and the text jumped — evidence: Paul 2026-11-04, the cart line's name ("The hover is not the same size as the active input field. The Text is aligned at the top. I think the text should be in the middle vertically and the initial height should be a standard input field height"); test "a ghost field at rest is one control tall with its text in the middle" — platform: all.
