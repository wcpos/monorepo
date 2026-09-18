# Behaviour ledger: `pos/columns`

Seeded 2026-09-18 from `.claude/research/2026-09-18-composed-behaviour-ledger.md` on `research/composed-ledger` (wcpos/roadmap#341) by wcpos/roadmap#345. Numbers are assigned once and never reused: a struck line leaves a gap, a new line takes the next number. Every line keeps its evidence. The rules for preserving or striking a line are in the [library strategy](https://github.com/wcpos/roadmap/blob/worktree-docs%2Bdesign-program-2026-09-12/docs/design/2026-09-18-library-strategy.md), section 3. Not reworded from the source.

**Job:** Arrange extension-provided POS panels and replace only the products content during checkout.

**Composes:** `@wcpos/components/panels`.

## Lines

1. Use one slot-driven layout for both routes, reverse panel order with products position and persist the products panel’s width only after user resizing — route/side changes must not create separate layout behavior or save programmatic sizing — evidence: `a061650537 2026-09-07 feat(pos): one slot-driven columns layout for both POS routes; open-order tabs become the pos.cart.bar slot entry with a top/bottom setting` — platform: all, wide layout.
2. Supply complementary default sizes to both panels and a minimum size — an unsized cart can otherwise remain a roughly 1.5% sliver on slow Android renderers — evidence: `pos-columns.tsx:73–79`, “BOTH panels stay sized”; “products panel next to an unsized cart renders 60:1 — a ~1.5% cart sliver.”; “With both sides sized the fallback IS the” / “correct layout, so the race is harmless.” — platform: all; observed defect on Android.
3. Swap only products content, keep the cart present, key tender by order UUID and prefer the independently selected receipt — two orders must not share a keypad reducer, and a new draft must not displace the paid receipt — evidence: `pos-columns.tsx:98`, “Keyed by order: two orders in checkout must not share one keypad reducer.”; `da7341cd68 2026-09-07 feat(checkout): the tender pane replaces the products column in place; checkout becomes a mode of the order` — platform: all, wide layout.
4. Fade checkout content over 180 ms rather than slide/rise — preserve the motion selected in the prototype ruling — evidence: `pos-columns.tsx:18`, “Ruled on wcpos/roadmap#165 from the prototype comparison (fade vs rise/slide/instant).” — platform: all, wide layout.
5. Give slot consumers stable module-level side snapshots with no notifications during a panel’s mount — a fixed layout side must not create unstable external-store snapshots — evidence: `pos-columns.tsx:27–28`, “A panel's side is fixed for as long as it is mounted, so these views never notify.” / “They are module constants because `useSlotValue` needs a stable snapshot.” — platform: all.
