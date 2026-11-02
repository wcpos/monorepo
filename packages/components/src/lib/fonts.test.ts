import { FONT_FACES, fontFamilyStyle, THEME_FONT_FAMILIES } from './fonts';

jest.mock('@wcpos/utils/platform', () => ({ Platform: { isWeb: false } }));
const { Platform: mockPlatform } = jest.requireMock('@wcpos/utils/platform');

it.each(Object.values(THEME_FONT_FAMILIES))('declares weighted faces for %s', (family) => {
	expect(FONT_FACES[family].fontFamily).toBe(family);
	expect(FONT_FACES[family].fontDefinitions.length).toBeGreaterThan(0);
	for (const face of FONT_FACES[family].fontDefinitions) {
		expect(typeof face.weight).toBe('number');
		expect(face.display).toBe('swap');
	}
});

it('leaves the system family unset', () => {
	expect(fontFamilyStyle(undefined)).toBeUndefined();
});

it('uses the bare family on native', () => {
	mockPlatform.isWeb = false;
	expect(fontFamilyStyle('DM Sans')).toEqual({ fontFamily: 'DM Sans' });
});

it.each([
	['DM Sans', 'system-ui, sans-serif'],
	['Instrument Serif', 'ui-serif, serif'],
	['Fraunces', 'ui-serif, serif'],
	['JetBrains Mono', 'ui-monospace, monospace'],
	['Space Grotesk', 'system-ui, sans-serif'],
	['Manrope', 'system-ui, sans-serif'],
] as const)('uses a quoted web stack for %s', (family, fallback) => {
	mockPlatform.isWeb = true;
	expect(fontFamilyStyle(family)).toEqual({ fontFamily: `"${family}", ${fallback}` });
});
