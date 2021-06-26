import defaultTheme, { ColorTypes } from './defaultTheme';

export type { ColorTypes };
export { switcher as default } from './switcher';

/**
 * Declare the default theme
 */
declare module 'styled-components/native' {
	export type Theme = typeof defaultTheme;

	// eslint-disable-next-line @typescript-eslint/no-empty-interface
	export interface DefaultTheme extends Theme {}
}
