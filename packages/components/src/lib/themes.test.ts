import { iconSetForTheme, THEME_ICON_SET, THEMES } from './themes';
import { DEFAULT_ICON_SET } from '../icon/sets';

jest.mock('react-native-svg', () => {
	const elements = jest.requireActual('react-native-svg/lib/commonjs/elements.web');
	return { ...elements, default: elements.Svg, __esModule: true };
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
])('draws %s in %s', (theme, set) => {
	expect(iconSetForTheme(theme)).toBe(set);
});

it.each(['system', undefined, 'nope', 'toString'])('draws the default family for %p', (theme) => {
	expect(iconSetForTheme(theme)).toBe(DEFAULT_ICON_SET);
});
