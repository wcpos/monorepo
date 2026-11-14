import { THEME_FONT_FAMILIES, type ThemeFontFamily } from './fonts';
import { DEFAULT_TRAITS, SYSTEM_TYPE, type ThemeTraits, type ThemeType } from './theme-traits';

import type { IconSetId } from '../icon/sets';

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

/** Everything a theme decides that its stylesheet cannot: one row per theme, every field required. */
interface ThemeRule {
	/** The PAGE is light: toasts and the status bar read this. */
	light: boolean;
	/** The RAIL is dark: the desktop window controls are drawn over the rail and read this. */
	darkRail: boolean;
	/** Decision 45: the icon set is a rule of the theme. */
	icons: IconSetId;
	/** The theme's type is a rule of the theme, as its icon family is (decision 45). */
	typeSet: TypeSetId;
	/**
	 * DEFAULT_TRAITS is the bare tint, the crossfade and the settle; a personality theme opts into
	 * the initial, the centred words, the price chip, the torn edge and the paid flash.
	 */
	traits: Omit<ThemeTraits, 'type'>;
}

/**
 * The names global.css draws (`@variant <name>`) and what each decides; `system` is a Settings
 * choice, not a theme. Every table below is read off this one.
 */
const THEME_RULES = {
	light: {
		light: true,
		darkRail: false,
		icons: 'tabler',
		typeSet: 'system',
		traits: DEFAULT_TRAITS,
	},
	dark: {
		light: false,
		darkRail: true,
		icons: 'tabler',
		typeSet: 'system',
		traits: DEFAULT_TRAITS,
	},
	ocean: {
		light: false,
		darkRail: true,
		icons: 'phosphor',
		typeSet: 'system',
		traits: DEFAULT_TRAITS,
	},
	sunset: {
		light: false,
		darkRail: true,
		icons: 'phosphor',
		typeSet: 'system',
		traits: DEFAULT_TRAITS,
	},
	monochrome: {
		light: false,
		darkRail: true,
		icons: 'tabler',
		typeSet: 'system',
		// Where the link ink is the foreground, a verb is marked by its underline, not its colour.
		traits: { ...DEFAULT_TRAITS, linkUnderline: true },
	},
	paper: {
		light: true,
		darkRail: false,
		icons: 'phosphor',
		typeSet: 'instrument',
		traits: {
			...DEFAULT_TRAITS,
			media: 'initial',
			wordsAlign: 'center',
			tear: true,
			linkUnderline: true,
		},
	},
	warm: {
		light: true,
		darkRail: false,
		icons: 'hugeicons',
		typeSet: 'fraunces',
		traits: { ...DEFAULT_TRAITS, media: 'initial' },
	},
	bold: {
		light: true,
		darkRail: true,
		icons: 'phosphor',
		typeSet: 'grotesk',
		traits: { ...DEFAULT_TRAITS, priceChip: true, paidFlash: true, linkUnderline: true },
	},
	market: {
		light: true,
		darkRail: true,
		icons: 'hugeicons',
		typeSet: 'manrope',
		traits: { ...DEFAULT_TRAITS, media: 'initial', tear: true },
	},
} satisfies Record<string, ThemeRule>;

export type ThemeName = keyof typeof THEME_RULES;
export const THEMES = Object.keys(THEME_RULES) as readonly ThemeName[];
export const isThemeName = (theme: string | undefined): theme is ThemeName =>
	(THEMES as readonly string[]).includes(theme ?? '');

function ruleTable<K extends keyof ThemeRule>(field: K): Record<ThemeName, ThemeRule[K]> {
	const rules: Record<ThemeName, ThemeRule> = THEME_RULES;
	return Object.fromEntries(THEMES.map((name) => [name, rules[name][field]])) as Record<
		ThemeName,
		ThemeRule[K]
	>;
}

export const THEME_TYPE_SET = ruleTable('typeSet');

export const THEME_TYPE = Object.fromEntries(
	THEMES.map((name) => [name, TYPE_SETS[THEME_TYPE_SET[name]]])
) as Record<ThemeName, ThemeType>;

export function typeSetForTheme(theme: string | undefined): TypeSetId {
	return isThemeName(theme) ? THEME_TYPE_SET[theme] : 'system';
}

export const THEME_TRAITS = ruleTable('traits');

export function traitsForTheme(theme: string | undefined): ThemeTraits {
	if (!isThemeName(theme)) return DEFAULT_TRAITS;
	return { ...THEME_TRAITS[theme], type: THEME_TYPE[theme] };
}

export function familiesForType({ body, num, display }: ThemeType): ThemeFontFamily[] {
	return [...new Set([body, num, display].filter((family) => family !== undefined))];
}

export const THEME_ICON_SET = ruleTable('icons');

/**
 * `system` and any unknown name draw the default family, the same `tabler` as
 * DEFAULT_ICON_SET; the pin test checks they agree without loading glyph maps here.
 */
export function iconSetForTheme(theme: string | undefined): IconSetId {
	return isThemeName(theme) ? THEME_ICON_SET[theme] : 'tabler';
}

export const LIGHT_THEMES: readonly ThemeName[] = THEMES.filter((name) => THEME_RULES[name].light);
export const isLightTheme = (theme: string | undefined) =>
	LIGHT_THEMES.includes(theme as ThemeName);

export const DARK_RAIL_THEMES: readonly ThemeName[] = THEMES.filter(
	(name) => THEME_RULES[name].darkRail
);
export const hasDarkRail = (theme: string | undefined) =>
	DARK_RAIL_THEMES.includes(theme as ThemeName);
