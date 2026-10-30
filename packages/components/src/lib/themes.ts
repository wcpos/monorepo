import type { IconSetId } from '../icon/sets';

/** The names global.css draws (`@variant <name>`); `system` is a Settings choice, not a theme. */
export const THEMES = ['light', 'dark', 'ocean', 'sunset', 'monochrome'] as const;
export type ThemeName = (typeof THEMES)[number];

/** Decision 45: the icon set is a rule of the theme. */
export const THEME_ICON_SET: Record<ThemeName, IconSetId> = {
	light: 'tabler',
	dark: 'tabler',
	monochrome: 'tabler',
	ocean: 'phosphor',
	sunset: 'phosphor',
};

/**
 * `system` and any unknown name draw the default family, the same `tabler` as
 * DEFAULT_ICON_SET; the pin test checks they agree without loading glyph maps here.
 */
export function iconSetForTheme(theme: string | undefined): IconSetId {
	return THEMES.includes(theme as ThemeName) ? THEME_ICON_SET[theme as ThemeName] : 'tabler';
}
