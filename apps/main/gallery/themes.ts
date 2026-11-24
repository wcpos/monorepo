import extraThemes from '../extra-themes.json';

// The shoot's theme split, kept apart from gallery.spec.ts so a Jest test can import it: the
// spec runs in Playwright's node process, which cannot load the components package's font assets.
// The colour themes are the same JSON list metro.config.js hands Uniwind as extraThemes.
// Light and dark are shot at every scale step and pointer. A theme swaps colour tokens and a
// step swaps size variables, and the two are independent, so the other themes are shot at
// one step: every story in all nine themes (decision 12, 2026-10-16; the four personality themes
// since 2026-11-06) without shooting the same geometry again.
// __tests__/gallery/themes.test.ts pins FULL ∪ COLOUR to the components package's THEMES, so a
// theme added to THEME_RULES fails the unit run until it is shot too.
export const FULL_THEMES = ['light', 'dark'] as const;
export const COLOUR_THEMES: readonly string[] = extraThemes;
