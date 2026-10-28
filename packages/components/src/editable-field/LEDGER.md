# Behaviour ledger: `editable-field`

Seeded 2026-10-28 by card 18 of the component-library review, when the field moved here from core's `screens/main/components/editable-field.tsx` (it imports nothing from core). Numbers are assigned once and never reused: a struck line leaves a gap, a new line takes the next number. Every line keeps its evidence.

**Job:** A grid cell's name that reads as text and becomes a textarea on press.

**Base:** `Button`, `Textarea`, `Text`; the placeholder class from `property-row`.

## Lines

1. The empty value reads as the shared property placeholder in muted ink (`PROPERTY_PLACEHOLDER_CLASS`, `property-row` line 7) — evidence: `property-row/LEDGER.md` line 7 — platform: all.
