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
export const isThemeName = (theme: string | undefined): theme is ThemeName =>
	(THEMES as readonly string[]).includes(theme ?? '');

export const TYPE_SETS = {
	system: SYSTEM_TYPE,
	instrument: {
		body: THEME_FONT_FAMILIES.dmSans,
		num: THEME_FONT_FAMILIES.jetbrainsMono,
		display: THEME_FONT_FAMILIES.instrumentSerif,
		displayItalic: true,
	},
	grotesk: {
		body: THEME_FONT_FAMILIES.spaceGrotesk,
		num: THEME_FONT_FAMILIES.spaceGrotesk,
		display: THEME_FONT_FAMILIES.spaceGrotesk,
	},
	fraunces: {
		body: THEME_FONT_FAMILIES.dmSans,
		num: THEME_FONT_FAMILIES.dmSans,
		display: THEME_FONT_FAMILIES.fraunces,
		displayItalic: true,
	},
	manrope: {
		body: THEME_FONT_FAMILIES.manrope,
		num: THEME_FONT_FAMILIES.manrope,
		display: THEME_FONT_FAMILIES.manrope,
	},
} as const satisfies Record<string, ThemeType>;
export type TypeSetId = keyof typeof TYPE_SETS;
export const TYPE_SET_IDS = Object.keys(TYPE_SETS) as TypeSetId[];
export const TYPE_SETTING_AUTO = 'auto';

/** The theme's type is a rule of the theme, as its icon family is (decision 45). */
export const THEME_TYPE_SET: Record<ThemeName, TypeSetId> = {
	light: 'system',
	dark: 'system',
	ocean: 'system',
	sunset: 'system',
	monochrome: 'system',
	paper: 'instrument',
	warm: 'fraunces',
	bold: 'grotesk',
	market: 'manrope',
};

export const THEME_TYPE = Object.fromEntries(
	THEMES.map((name) => [name, TYPE_SETS[THEME_TYPE_SET[name]]])
) as Record<ThemeName, ThemeType>;

export function typeSetForTheme(theme: string | undefined): TypeSetId {
	return THEMES.includes(theme as ThemeName) ? THEME_TYPE_SET[theme as ThemeName] : 'system';
}

export const THEME_TRAITS: Record<ThemeName, Omit<ThemeTraits, 'type'>> = {
	// DEFAULT_TRAITS is the bare tint, the crossfade and the settle; a personality theme opts into
	// the initial, the centred words, the price chip, the torn edge and the paid flash.
	light: DEFAULT_TRAITS,
	dark: DEFAULT_TRAITS,
	ocean: DEFAULT_TRAITS,
	sunset: DEFAULT_TRAITS,
	// Where the link ink is the foreground, a verb is marked by its underline, not its colour.
	monochrome: { ...DEFAULT_TRAITS, linkUnderline: true },
	paper: {
		...DEFAULT_TRAITS,
		media: 'initial',
		wordsAlign: 'center',
		tear: true,
		linkUnderline: true,
	},
	bold: { ...DEFAULT_TRAITS, priceChip: true, paidFlash: true, linkUnderline: true },
	warm: { ...DEFAULT_TRAITS, media: 'initial' },
	market: { ...DEFAULT_TRAITS, media: 'initial', tear: true },
};

export function traitsForTheme(theme: string | undefined): ThemeTraits {
	if (!THEMES.includes(theme as ThemeName)) return DEFAULT_TRAITS;
	return { ...THEME_TRAITS[theme as ThemeName], type: THEME_TYPE[theme as ThemeName] };
}

export function familiesForType({ body, num, display }: ThemeType): ThemeFontFamily[] {
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
