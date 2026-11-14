# Behaviour ledger: `avatar`

Seeded 2026-09-18 from `.claude/research/2026-09-12-component-behaviour-ledger.md` on `research/component-ledger` (wcpos/roadmap#285) by wcpos/roadmap#345. Numbers are assigned once and never reused: a struck line leaves a gap, a new line takes the next number. Every line keeps its evidence. The rules for preserving or striking a line are in the [library strategy](https://github.com/wcpos/roadmap/blob/worktree-docs%2Bdesign-program-2026-09-12/docs/design/2026-09-18-library-strategy.md), section 3. Not reworded from the source.

**Job:** A profile or site image with configurable shape, size, colour, and initials fallback.

**Base:** `react-native` View, `class-variance-authority`, and local Image/Text components; no `@rn-primitives/*` import. Platform: no split.

## Lines

1. Defaults to initials when the image source is missing or loading fails — evidence: `f5e4f50bc7 2026-04-17 feat(auth): redesign connect screen and harden store/user sync`, code: `"onError={() => setErrored(true)}"` in `packages/components/src/avatar/index.tsx:130`.
2. Resets image-error state using source content rather than source-object identity — evidence: `bf4403a2ea 2026-05-22 fix: address remaining PR blockers`, code: `"if (sourceKey !== prevSourceKey) {"` in `packages/components/src/avatar/index.tsx:110`.
3. Returns a question-mark initial for empty or whitespace-only names — evidence: `87cb134e9a 2026-04-21 fix: harden components and localize auth copy`, code: `"if (!trimmed) return '?';"` in `packages/components/src/avatar/index.tsx:169`.
4. A tone (`success`, `warning`, `error`) is the 15% wash behind the initials; the initials stay in the foreground, as a tinted Badge's words do, because a tone's own colour on its wash reads under the 4.5:1 text floor (light theme: success 4.0:1, error 4.2:1, warning 2.6:1) — evidence: CODING_STANDARDS § Design 7 (text contrast 4.5:1) and § Components, Chips/badges (`tinted`: "the tone's wash, words in the foreground"), code: "`success: 'text-foreground'`" in `packages/components/src/avatar/index.tsx`.
5. A cashier or customer avatar shows their picture, else their initials on the theme's primary (`default`: `bg-primary`, `text-primary-foreground`), never Gravatar's grey silhouette: a Gravatar URL (`*.gravatar.com/avatar/`) has its `d`/`default` rewritten to `404` so a missing picture fails into the initials, every other URL passes untouched, and an empty `uri` counts as no picture; a non-person keeps `muted` (the site icon) or `icon` with `muted` (the Guest customer) — evidence: owner rule 2026-10-18 (cart customer pill read "Cliente [person icon] admin"), code: `withoutDefaultGravatar` in `packages/components/src/avatar/gravatar.ts`; test `avatar.test.tsx`.
6. Line 4 struck by card 16 (2026-10-28): the `success`/`warning`/`error` washes had no caller and went; the variants are `default` (a person) and `muted` (a non-person) — evidence: card 16 of the 2026-10-28 component-library review (`lib/tone.ts`), test `lib/tone.test.ts`.
