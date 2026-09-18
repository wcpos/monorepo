# Behaviour ledger: `pos/contexts/overlay-side`

Seeded 2026-09-18 from `.claude/research/2026-09-18-composed-behaviour-ledger.md` on `research/composed-ledger` (wcpos/roadmap#341) by wcpos/roadmap#345. Numbers are assigned once and never reused: a struck line leaves a gap, a new line takes the next number. Every line keeps its evidence. The rules for preserving or striking a line are in the [library strategy](https://github.com/wcpos/roadmap/blob/worktree-docs%2Bdesign-program-2026-09-12/docs/design/2026-09-18-library-strategy.md), section 3. Not reworded from the source.

**Job:** Supply responsive POS overlay direction and the opposite-side direction for panel settings.

**Composes:** none directly.

## Lines

1. Open wide POS overlays from the products side, opposite the cart; use bottom sheets on phones and default non-POS consumers to the right — overlays should leave the active cart visible without changing unrelated screens — evidence: `a49db27e0b 2026-09-11 feat(pos): overlays slide in from the products side, opposite the cart (#1985)` — platform: all, responsive by screen size.
2. Flip left/right for a panel’s own settings while retaining bottom on phones — products settings belong over the cart, not over the products being configured — evidence: `da8191c571 2026-09-11 feat(pos): overlay batch 6 — order meta owns status, cashier and note; products settings open over the cart (#1991)` — platform: all.
