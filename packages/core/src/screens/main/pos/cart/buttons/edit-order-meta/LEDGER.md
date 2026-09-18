# Behaviour ledger: `pos/cart/buttons/edit-order-meta`

Seeded 2026-09-18 from `.claude/research/2026-09-18-composed-behaviour-ledger.md` on `research/composed-ledger` (wcpos/roadmap#341) by wcpos/roadmap#345. Numbers are assigned once and never reused: a struck line leaves a gap, a new line takes the next number. Every line keeps its evidence. The rules for preserving or striking a line are in the [library strategy](https://github.com/wcpos/roadmap/blob/worktree-docs%2Bdesign-program-2026-09-12/docs/design/2026-09-18-library-strategy.md), section 3. Not reworded from the source.

**Job:** Edit order metadata locally and explicitly confirm status/cashier hand-offs.

**Composes:** `@wcpos/components/{alert-dialog,button,combobox,dialog,form,hstack,suspense,tabs,text,tree}`.

## Lines

1. Save ordinary note/metadata changes locally, but ask before sending changed status or cashier — identity edits can move the order out of this cashier’s open set — evidence: `da8191c571 2026-09-11 feat(pos): overlay batch 6 — order meta owns status, cashier and note; products settings open over the cart (#1991)`; test `form.test.tsx`: “saves notes locally without confirmation or push when identity is unchanged” — platform: all.
2. Stamp the selected cashier while preserving store/register/till identity, then clear selection only when the order leaves this cashier’s open statuses — a hand-off must not erase provenance or unnecessarily abandon an open order — evidence: `da8191c571 2026-09-11 feat(pos): overlay batch 6 — order meta owns status, cashier and note; products settings open over the cart (#1991)` — platform: all.
3. On send failure, restore prior status/metadata and push that restoration only if its local patch succeeded — an apparently failed queued send may still land; pushing a failed restoration would resend the hand-off — evidence: `pos/cart/buttons/edit-order-meta/form.tsx:166–170`, “The failed send may still land”; test `form.test.tsx`: “does not re-send the hand-off when the revert patch itself fails” — platform: all.
4. Guard confirmed sends against degraded storage and disable confirmation/cancellation while sending — prevents an unpersistable or overlapping hand-off — evidence: `da8191c571 2026-09-11 feat(pos): overlay batch 6 — order meta owns status, cashier and note; products settings open over the cart (#1991)`; test `form.test.tsx`: “does not write or push when storage is degraded” — platform: all.
5. Refresh form values from the order and give both form/JSON tabs shrinkable scrolling bodies with a pinned action footer — external updates remain visible and long metadata cannot push Save out of reach — evidence: `22a2174191 2026-01-23 refactor: useEffect audit and best practices improvements`; `a49db27e0b 2026-09-11 feat(pos): overlays slide in from the products side, opposite the cart (#1985)` — platform: all.
