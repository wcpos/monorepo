import * as React from 'react';

import type { ThemeFontFamily } from './fonts';

export type ThemeType = {
	body?: ThemeFontFamily;
	num?: ThemeFontFamily;
	display?: ThemeFontFamily;
	displayItalic?: boolean;
};
export type ThemeTraits = { type: ThemeType };
export const SYSTEM_TYPE: ThemeType = {};

/**
 * Traits a stylesheet cannot carry (which typeface, later which tile media and which moments),
 * supplied per theme by the app's provider; without a provider everything is the system default.
 */
export const ThemeTraitsContext = React.createContext<ThemeTraits>({ type: SYSTEM_TYPE });
export const useThemeTraits = () => React.useContext(ThemeTraitsContext);
