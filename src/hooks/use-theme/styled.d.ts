import 'styled-components/native';
import theme from './themes/defaultTheme';

declare module 'styled-components' {
	type Theme = typeof theme;
	// eslint-disable-next-line @typescript-eslint/no-empty-interface
	export interface DefaultTheme extends Theme {}
}
