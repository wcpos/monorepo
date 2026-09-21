# Behaviour ledger: `image`

Seeded 2026-09-18 from `.claude/research/2026-09-12-component-behaviour-ledger.md` on `research/component-ledger` (wcpos/roadmap#285) by wcpos/roadmap#345. Numbers are assigned once and never reused: a struck line leaves a gap, a new line takes the next number. Every line keeps its evidence. The rules for preserving or striking a line are in the [library strategy](https://github.com/wcpos/roadmap/blob/worktree-docs%2Bdesign-program-2026-09-12/docs/design/2026-09-18-library-strategy.md), section 3. Not reworded from the source.

**Job:** An Expo image wrapper with shared display defaults and Tailwind class support.

**Base:** `expo-image`, plus `uniwind` on native. Platform-specific file: `packages/components/src/image/index.web.tsx`; native resolves to `index.tsx`.

## Lines

1. Passes `className` directly to ExpoImage on web instead of using the native styling wrapper — evidence: `f8831e2527 2025-09-29 fix images on web`, code: "Web-specific Image component that passes className directly to ExpoImage" in `packages/components/src/image/index.web.tsx:13`.
2. Converts native `className` styling through Uniwind’s wrapper — evidence: code: "withUniwind automatically maps className → style prop." in `packages/components/src/image/index.tsx:8`.
