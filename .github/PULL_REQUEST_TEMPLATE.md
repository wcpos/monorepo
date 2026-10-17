## What and why

<!-- One paragraph: what changed and the issue or ruling it answers. -->

## Validation

<!-- The commands you ran and their results. Say what was not verified live. -->

## UI changes (CODING_STANDARDS.md § Design, "Definition of done"); delete if none

- [ ] Walked every state: empty, loading, saving, error, offline, disabled, long text, phone width, dark mode
- [ ] Screenshots of the changed states below, tablet and phone
- [ ] No new hex or `oklch()` colour, no new explanatory paragraph, no new `useEffect` for layout
- [ ] Touch targets and contrast checked, not assumed
- [ ] Every interactive element carries a stable `testID`
- [ ] The component tables (buttons, overlays, chips, page bars) are followed

**Rule this PR breaks and why:** <!-- "none", or the § Design line and the reason -->
