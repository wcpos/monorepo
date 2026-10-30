import {
	familiesForTheme,
	hasDarkRail,
	iconSetForTheme,
	isLightTheme,
	THEME_ICON_SET,
	THEME_TYPE,
	THEMES,
} from './themes';
import { DEFAULT_ICON_SET } from '../icon/sets';

jest.mock('react-native-svg', () => {
	const elements = jest.requireActual('react-native-svg/lib/commonjs/elements.web');
	return { ...elements, default: elements.Svg, __esModule: true };
});

it.each(THEMES)('defines type for %s', (theme) => {
	expect(THEME_TYPE[theme]).toBeDefined();
});

it.each([
	['paper', ['DM Sans', 'JetBrains Mono', 'Instrument Serif']],
	['bold', ['Space Grotesk']],
	['warm', ['DM Sans', 'Fraunces']],
	['market', ['Manrope']],
	['light', []],
	['nope', []],
	[undefined, []],
])('lists only the distinct families for %p', (theme, families) => {
	expect(familiesForTheme(theme as string | undefined)).toEqual(families);
});

it.each(THEMES)('maps the drawn theme %s to an icon family', (theme) => {
	expect(THEME_ICON_SET[theme]).toBeDefined();
});

it.each([
	['light', 'tabler'],
	['dark', 'tabler'],
	['monochrome', 'tabler'],
	['ocean', 'phosphor'],
	['sunset', 'phosphor'],
	['paper', 'phosphor'],
	['warm', 'hugeicons'],
	['bold', 'phosphor'],
	['market', 'hugeicons'],
])('draws %s in %s', (theme, set) => {
	expect(iconSetForTheme(theme)).toBe(set);
});

it.each(['system', undefined, 'nope', 'toString'])('draws the default family for %p', (theme) => {
	expect(iconSetForTheme(theme)).toBe(DEFAULT_ICON_SET);
});

it.each(['light', 'paper', 'warm'])('%s has a light page and rail', (theme) => {
	expect(isLightTheme(theme)).toBe(true);
	expect(hasDarkRail(theme)).toBe(false);
});

it.each(['bold', 'market'])('%s has a light page and a dark rail', (theme) => {
	expect(isLightTheme(theme)).toBe(true);
	expect(hasDarkRail(theme)).toBe(true);
});

it.each(['dark', 'ocean', 'sunset', 'monochrome'])('%s has a dark page and rail', (theme) => {
	expect(isLightTheme(theme)).toBe(false);
	expect(hasDarkRail(theme)).toBe(true);
});

it.each(['system', undefined, 'nope', 'toString'])(
	'%p is neither a light theme nor a dark rail',
	(theme) => {
		expect(isLightTheme(theme)).toBe(false);
		expect(hasDarkRail(theme)).toBe(false);
	}
);
