import { THEME_FONT_FAMILIES, type ThemeFontFamily } from './fonts';
import { DEFAULT_TRAITS, SYSTEM_TYPE, type ThemeTraits, type ThemeType } from './theme-traits';

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

export const THEME_TYPE: Record<ThemeName, ThemeType> = {
	light: SYSTEM_TYPE,
	dark: SYSTEM_TYPE,
	ocean: SYSTEM_TYPE,
	sunset: SYSTEM_TYPE,
	monochrome: SYSTEM_TYPE,
	paper: {
		body: THEME_FONT_FAMILIES.dmSans,
		num: THEME_FONT_FAMILIES.jetbrainsMono,
		display: THEME_FONT_FAMILIES.instrumentSerif,
		displayItalic: true,
	},
	bold: {
		body: THEME_FONT_FAMILIES.spaceGrotesk,
		num: THEME_FONT_FAMILIES.spaceGrotesk,
		display: THEME_FONT_FAMILIES.spaceGrotesk,
	},
	warm: {
		body: THEME_FONT_FAMILIES.dmSans,
		num: THEME_FONT_FAMILIES.dmSans,
		display: THEME_FONT_FAMILIES.fraunces,
		displayItalic: true,
	},
	market: {
		body: THEME_FONT_FAMILIES.manrope,
		num: THEME_FONT_FAMILIES.manrope,
		display: THEME_FONT_FAMILIES.manrope,
	},
};

export const THEME_TRAITS: Record<ThemeName, Omit<ThemeTraits, 'type'>> = {
	light: { media: 'blank', wordsAlign: 'start', priceChip: false, tear: false },
	dark: { media: 'blank', wordsAlign: 'start', priceChip: false, tear: false },
	ocean: { media: 'blank', wordsAlign: 'start', priceChip: false, tear: false },
	sunset: { media: 'blank', wordsAlign: 'start', priceChip: false, tear: false },
	monochrome: { media: 'blank', wordsAlign: 'start', priceChip: false, tear: false },
	paper: { media: 'initial', wordsAlign: 'center', priceChip: false, tear: true },
	bold: { media: 'blank', wordsAlign: 'start', priceChip: true, tear: false },
	warm: { media: 'initial', wordsAlign: 'start', priceChip: false, tear: false },
	market: { media: 'initial', wordsAlign: 'start', priceChip: false, tear: true },
};

export function traitsForTheme(theme: string | undefined): ThemeTraits {
	if (!THEMES.includes(theme as ThemeName)) return DEFAULT_TRAITS;
	return { ...THEME_TRAITS[theme as ThemeName], type: THEME_TYPE[theme as ThemeName] };
}

export function familiesForTheme(theme: string | undefined): ThemeFontFamily[] {
	if (!THEMES.includes(theme as ThemeName)) return [];
	const { body, num, display } = THEME_TYPE[theme as ThemeName];
	return [...new Set([body, num, display].filter((family) => family !== undefined))];
}

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
