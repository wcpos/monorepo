import { Platform } from '@wcpos/utils/platform';

import type { FontFamilyDefinition } from 'expo-font';

export const THEME_FONT_FAMILIES = {
	dmSans: 'DM Sans',
	instrumentSerif: 'Instrument Serif',
	jetbrainsMono: 'JetBrains Mono',
	spaceGrotesk: 'Space Grotesk',
	fraunces: 'Fraunces',
	manrope: 'Manrope',
} as const;
export type ThemeFontFamily = (typeof THEME_FONT_FAMILIES)[keyof typeof THEME_FONT_FAMILIES];

// FontDisplay is a string enum; keep this registry data-only rather than importing Expo at runtime.
export const FONT_FACES = {
	'DM Sans': {
		fontFamily: 'DM Sans',
		fontDefinitions: [
			{ path: require('../../assets/fonts/DMSans-400.ttf'), weight: 400, display: 'swap' },
			{ path: require('../../assets/fonts/DMSans-500.ttf'), weight: 500, display: 'swap' },
			{ path: require('../../assets/fonts/DMSans-600.ttf'), weight: 600, display: 'swap' },
			{ path: require('../../assets/fonts/DMSans-700.ttf'), weight: 700, display: 'swap' },
		],
	},
	'Instrument Serif': {
		fontFamily: 'Instrument Serif',
		fontDefinitions: [
			{ path: require('../../assets/fonts/InstrumentSerif-400.ttf'), weight: 400, display: 'swap' },
			{
				path: require('../../assets/fonts/InstrumentSerif-400Italic.ttf'),
				weight: 400,
				style: 'italic',
				display: 'swap',
			},
		],
	},
	'JetBrains Mono': {
		fontFamily: 'JetBrains Mono',
		fontDefinitions: [
			{ path: require('../../assets/fonts/JetBrainsMono-400.ttf'), weight: 400, display: 'swap' },
			{ path: require('../../assets/fonts/JetBrainsMono-500.ttf'), weight: 500, display: 'swap' },
			{ path: require('../../assets/fonts/JetBrainsMono-600.ttf'), weight: 600, display: 'swap' },
		],
	},
	'Space Grotesk': {
		fontFamily: 'Space Grotesk',
		fontDefinitions: [
			{ path: require('../../assets/fonts/SpaceGrotesk-500.ttf'), weight: 500, display: 'swap' },
			{ path: require('../../assets/fonts/SpaceGrotesk-600.ttf'), weight: 600, display: 'swap' },
			{ path: require('../../assets/fonts/SpaceGrotesk-700.ttf'), weight: 700, display: 'swap' },
		],
	},
	Fraunces: {
		fontFamily: 'Fraunces',
		fontDefinitions: [
			{ path: require('../../assets/fonts/Fraunces-500.ttf'), weight: 500, display: 'swap' },
			{ path: require('../../assets/fonts/Fraunces-600.ttf'), weight: 600, display: 'swap' },
			{
				path: require('../../assets/fonts/Fraunces-500Italic.ttf'),
				weight: 500,
				style: 'italic',
				display: 'swap',
			},
			{
				path: require('../../assets/fonts/Fraunces-600Italic.ttf'),
				weight: 600,
				style: 'italic',
				display: 'swap',
			},
		],
	},
	Manrope: {
		fontFamily: 'Manrope',
		fontDefinitions: [
			{ path: require('../../assets/fonts/Manrope-500.ttf'), weight: 500, display: 'swap' },
			{ path: require('../../assets/fonts/Manrope-600.ttf'), weight: 600, display: 'swap' },
			{ path: require('../../assets/fonts/Manrope-700.ttf'), weight: 700, display: 'swap' },
			{ path: require('../../assets/fonts/Manrope-800.ttf'), weight: 800, display: 'swap' },
		],
	},
} as Record<ThemeFontFamily, FontFamilyDefinition>;

export function fontFamilyStyle(
	family: ThemeFontFamily | undefined
): { fontFamily: string } | undefined {
	if (!family) return undefined;
	if (!Platform.isWeb) return { fontFamily: family };
	const fallback =
		family === 'Instrument Serif' || family === 'Fraunces'
			? 'ui-serif, serif'
			: family === 'JetBrains Mono'
				? 'ui-monospace, monospace'
				: 'system-ui, sans-serif';
	return { fontFamily: `"${family}", ${fallback}` };
}
