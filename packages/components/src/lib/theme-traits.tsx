import * as React from 'react';

import type { ThemeFontFamily } from './fonts';

export type ThemeType = {
	body?: ThemeFontFamily;
	num?: ThemeFontFamily;
	display?: ThemeFontFamily;
	displayItalic?: boolean;
};
export type ThemeTraits = {
	type: ThemeType;
	media: 'initial' | 'blank';
	wordsAlign: 'start' | 'center';
	priceChip: boolean;
	tear: boolean;
	settle: boolean;
	paidFlash: boolean;
};
export const SYSTEM_TYPE: ThemeType = {};
export const DEFAULT_TRAITS: ThemeTraits = {
	type: SYSTEM_TYPE,
	// The bare tint, as the five original themes have always drawn it; the initial is a personality trait.
	media: 'blank',
	wordsAlign: 'start',
	priceChip: false,
	tear: false,
	settle: true,
	paidFlash: false,
};

/**
 * Traits a stylesheet cannot carry (which typeface, tile construction and moments),
 * supplied per theme by the app's provider; without a provider everything is the system default.
 */
export const ThemeTraitsContext = React.createContext<ThemeTraits>(DEFAULT_TRAITS);
export const useThemeTraits = () => React.useContext(ThemeTraitsContext);
