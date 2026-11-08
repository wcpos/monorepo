# Behaviour ledger: `input`

Seeded 2026-09-18 from `.claude/research/2026-09-12-component-behaviour-ledger.md` on `research/component-ledger` (wcpos/roadmap#285) by wcpos/roadmap#345. Numbers are assigned once and never reused: a struck line leaves a gap, a new line takes the next number. Every line keeps its evidence. The rules for preserving or striking a line are in the [library strategy](https://github.com/wcpos/roadmap/blob/worktree-docs%2Bdesign-program-2026-09-12/docs/design/2026-09-18-library-strategy.md), section 3. Not reworded from the source.

**Job:** A composable text input with keyboard-type mapping, shared focus styling, and an optional clear button.

**Base:** `react-native` TextInput/View and `@rn-primitives/hooks` controllable state. Platform split: no split; web-specific styling uses `web:` classes.

## Lines

1. Delays autofocus by 50 ms to work around unreliable RNTextInput autofocus and competing focus owners — evidence: code: "Workaround for autoFocus not working reliably on RNTextInput." in `packages/components/src/input/index.tsx:134`.
2. Runs the delayed autofocus effect only on mount rather than whenever `autoFocus` changes — evidence: `8c11023a40 2026-02-07 fix: audit and fix 12 problematic useEffect patterns across codebase`, code: "Empty dependency array is intentional - run once on mount only." in `packages/components/src/input/index.tsx:136`.
3. Sends a synthetic change event when clearing so parents using `onChange` receive the empty value — evidence: code: "Web-specific workaround: simulate a change event for parent components" in `packages/components/src/input/index.tsx:217`.
4. Restores input focus after clearing — evidence: `7b1e6a7fce 2024-11-08 update combobox to use popover primitives`, code: "inputRef.current.focus();" in `packages/components/src/input/index.tsx:224`.
5. Exposes a clear-button testID for reliably emptying native fields before retyping — evidence: `013d430f22 2026-09-02 fix(e2e-native): clear the URL field through its × before retyping`, code: "testID={clearTestID}" in `packages/components/src/input/index.tsx:246`.
6. The field's line box is `web:leading-none native:leading-[1.2]`: browsers centre single-line input text themselves, so web keeps the tight box from the native numeric-input fix; iOS places the glyphs by the font's metrics, drawing them 2.2pt above centre in a 1em box and 1.8pt below it in Tailwind's 1.35em base box, and 1.2em (SF's ascent + descent) measured centred to 0.2pt on an iPhone 16 Pro (2026-11-08) — evidence: `385724107b 2025-12-11 fix numput input on native`, code: "text-base leading-none outline-none" in `packages/components/src/input/index.tsx:154`; test `input-clear.test.tsx` "one tight line box on web, SF ascent + descent on native, so the text sits centred".
7. The box is `FieldBox` (`field-box` line 1): focus is its `open` state (the one ring), `disabled` its one dim; the field reads the box's text tone and placeholder tone through `TextClassContext`, because a TextInput's colour does not inherit from the View around it — evidence: the field box is `field-box` (card 2 of the component-library review, 2026-10-28).
8. `Root` forwards `figure` to the field box for an amount typed as the screen's figure (wcpos/roadmap#568 slice 1) — evidence: `field-box/index.test.ts`; gallery stories `figure` and `figure-empty`.
