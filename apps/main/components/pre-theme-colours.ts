/**
 * The light theme's tokens (`@variant light` in `apps/main/global.css`) as hex, for the screens that
 * render above every provider, before Uniwind has a theme: no className resolves there. This is the
 * ONE hard-coded palette in the app. `pre-theme-colours.test.ts` reads global.css and fails when a
 * value here stops matching its token, so a theme change cannot leave the pre-theme gate behind.
 * Out-of-gamut tokens are clipped to sRGB, as a browser paints them on an sRGB screen.
 */
export const PRE_THEME_COLOURS = {
	background: '#f5f7f9', // --background
	foreground: '#141b24', // --foreground
	card: '#ffffff', // --card
	border: '#dadee3', // --border
	primary: '#0069bd', // --primary
	primaryForeground: '#f6fdff', // --primary-foreground
	muted: '#edf0f4', // --muted
	mutedForeground: '#5b646f', // --muted-foreground
	warnBg: '#fff4d7', // --warn-bg
	warnText: '#915200', // --warn-text
	badBg: '#fff0ee', // --bad-bg
	bad: '#d73337', // --bad
	// The ink on a filled `bad` (a destructive confirm). The token sheet has no `--bad-foreground`,
	// so this is `--primary-foreground`, the near-white the other filled controls carry.
	badForeground: '#f6fdff', // --primary-foreground
} as const;

/** The token sheet's one radius (`--radius: 8px`, `rounded-lg`). */
export const PRE_THEME_RADIUS = 8;
