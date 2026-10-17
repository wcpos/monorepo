/**
 * The light theme's tokens (`@variant light` in global.css) as hex, for the two screens that render
 * above every provider, before Uniwind has a theme: no className resolves there. This is the ONE
 * hard-coded palette in the app; keep it in step with the light theme when that changes.
 */
export const PRE_THEME_COLOURS = {
	background: '#f5f7f9',
	foreground: '#141b24',
	card: '#ffffff',
	primary: '#0069bd',
	primaryForeground: '#f6fdff',
	destructive: '#d40924',
	destructiveForeground: '#fff9f8',
} as const;

/** The token sheet's one radius (`--radius: 8px`, `rounded-lg`). */
export const PRE_THEME_RADIUS = 8;
