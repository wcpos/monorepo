import defaultTheme from './defaultTheme';

/**
 * Returns a theme
 * @param name
 * @param mode
 */
export function switcher(name = 'default', mode = 'light') {
	if (mode === 'dark') {
		defaultTheme.PAGE_BACKGROUND_COLOR = 'black';
	}
	return defaultTheme;
}
