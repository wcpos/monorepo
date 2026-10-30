import type { IconSetId } from '../icon/sets';

/** The names global.css draws (`@variant <name>`); `system` is a Settings choice, not a theme. */
export const THEMES = [
	'light',
	'dark',
	'ocean',
	'sunset',
	'monochrome',
	'paper',
	'warm',
	'bold',
	'market',
] as const;
export type ThemeName = (typeof THEMES)[number];

/** Decision 45: the icon set is a rule of the theme. */
export const THEME_ICON_SET: Record<ThemeName, IconSetId> = {
	light: 'tabler',
	dark: 'tabler',
	monochrome: 'tabler',
	ocean: 'phosphor',
	sunset: 'phosphor',
	paper: 'phosphor',
	warm: 'hugeicons',
	bold: 'phosphor',
	market: 'hugeicons',
};

/**
 * `system` and any unknown name draw the default family, the same `tabler` as
 * DEFAULT_ICON_SET; the pin test checks they agree without loading glyph maps here.
 */
export function iconSetForTheme(theme: string | undefined): IconSetId {
	return THEMES.includes(theme as ThemeName) ? THEME_ICON_SET[theme as ThemeName] : 'tabler';
}

/** Themes whose PAGE is light: toasts and the status bar read this. */
export const LIGHT_THEMES: readonly ThemeName[] = ['light', 'paper', 'warm', 'bold', 'market'];
export const isLightTheme = (theme: string | undefined) =>
	LIGHT_THEMES.includes(theme as ThemeName);

/** Themes whose RAIL is dark: the desktop window controls are drawn over the rail and read this. */
export const DARK_RAIL_THEMES: readonly ThemeName[] = [
	'dark',
	'ocean',
	'sunset',
	'monochrome',
	'bold',
	'market',
];
export const hasDarkRail = (theme: string | undefined) =>
	DARK_RAIL_THEMES.includes(theme as ThemeName);
