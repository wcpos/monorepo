# Behaviour ledger: `gate-screen`

Seeded 2026-10-21 from the gate-screen design board (`~/Projects/wcpos-handoffs/gate-screen-2026-10-21.html`, shape A) by the PR that introduced the component (branch `feat/gate-screen`). Numbers are assigned once and never reused: a struck line leaves a gap, a new line takes the next number. Every line keeps its evidence. The rules for preserving or striking a line are in the [library strategy](https://github.com/wcpos/roadmap/blob/worktree-docs%2Bdesign-program-2026-09-12/docs/design/2026-09-18-library-strategy.md), section 3. Not reworded from the source.

**Job:** The one screen for a state that replaces the whole app.

**Base:** `react-native` ScrollView and View; `Logo`, `Card`, `Icon`, `Text`, `VStack`, `Button` and `DocsLink`.

## Lines

1. The one screen for a state that replaces the whole app (a protocol refusal, a plugin too old, a missing route); no bar, no rail — evidence: the gate-screen board, 2026-10-21; `feat/gate-screen`.
2. The sign-in mark above one card at the sign-in reading width (`max-w-md`, 448: the board's 440; the arbitrary-px ratchet refuses connect.tsx's literal 460), the card inset doubled to 32 (16 on a phone) — evidence: the gate-screen board, shape A; `packages/core/src/screens/auth/connect.tsx`; `feat/gate-screen`.
3. The tone lives on the disc; the title is foreground ink, never a tone colour — evidence: the gate-screen board's guideline table; `notice` ledger line 2 (`bad` is the only red surface); `feat/gate-screen`.
4. One primary, at most one outline secondary, stacked full width under it, and one docs link — evidence: the gate-screen board's elements table; `CODING_STANDARDS.md` § Buttons; `feat/gate-screen`.
5. The detail is one monospace line, never a stack — evidence: the gate-screen board ("Render failed" state); `feat/gate-screen`.
6. Copy for a coded gate comes from the error registry, one source for the screen, the log row and the docs page — evidence: the gate-screen board's guideline table; `packages/utils/src/logger/error-registry.json` (SYNC341); `feat/gate-screen`.
7. An action label wraps on every platform: `ButtonText` defaults to `numberOfLines={1}`, which the web whitespace class does not lift on iOS and Android, so the gate passes `numberOfLines={0}` (as `docs-link` does) — evidence: Codex review on wcpos/monorepo `feat/gate-screen`, 2026-10-21; the same fix applied to `empty-state` line 6 and `notice` line 8.
8. The content insets the screen edge by the page gutter (16), the same as sign-in — evidence: `CODING_STANDARDS.md` § Gutters (the phone's screen edge is 16); Codex review on wcpos/monorepo#2805; `packages/core/src/screens/auth/connect.tsx`.
9. An action can be `disabled` and keeps its slot while its state changes (the parked tab's *Take over here* while the handover runs), never emptying it — evidence: `CODING_STANDARDS.md` § Buttons (a slot never empties while its state changes); `apps/main/components/parked-tab.tsx`; `feat/gate-screen-sweep`.
10. A boundary around a whole route falls back to `FallbackScreen` (`error-boundary/fallback-screen.tsx`): a `bad` gate, *Something went wrong*, the thrown message clipped to 300 characters in the detail, *Try again* resetting the boundary; a boundary around part of a screen keeps the inline bar — evidence: the gate-screen sweep after wcpos/monorepo#2805; `feat/gate-screen-sweep`.
