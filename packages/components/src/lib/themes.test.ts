import { DEFAULT_TRAITS, SYSTEM_TYPE } from './theme-traits';
import {
	DARK_RAIL_THEMES,
	familiesForType,
	hasDarkRail,
	iconSetForTheme,
	isLightTheme,
	isThemeName,
	LIGHT_THEMES,
	THEME_ICON_SET,
	THEME_TRAITS,
	THEME_TYPE,
	THEME_TYPE_SET,
	THEMES,
	traitsForTheme,
	TYPE_SET_IDS,
	TYPE_SETS,
	typeSetForTheme,
} from './themes';
import { DEFAULT_ICON_SET } from '../icon/sets';

jest.mock('react-native-svg', () => {
	const elements = jest.requireActual('react-native-svg/lib/commonjs/elements.web');
	return { ...elements, default: elements.Svg, __esModule: true };
});

it.each(THEMES)('defines type for %s', (theme) => {
	expect(THEME_TYPE[theme]).toBeDefined();
});

it.each(THEMES)('maps %s to its type set', (theme) => {
	expect(TYPE_SET_IDS).toContain(THEME_TYPE_SET[theme]);
	expect(THEME_TYPE[theme]).toBe(TYPE_SETS[THEME_TYPE_SET[theme]]);
});

it.each(['system', undefined, 'nope', 'toString'])('uses system type for %p', (theme) => {
	expect(typeSetForTheme(theme)).toBe('system');
});

it('keeps system type and de-duplicates faces in body, numbers, display order', () => {
	expect(TYPE_SETS.system).toBe(SYSTEM_TYPE);
	expect(familiesForType(SYSTEM_TYPE)).toEqual([]);
	expect(familiesForType({ body: 'DM Sans', num: 'DM Sans', display: 'Fraunces' })).toEqual([
		'DM Sans',
		'Fraunces',
	]);
	expect(familiesForType(TYPE_SETS.instrument)).toEqual([
		'DM Sans',
		'JetBrains Mono',
		'Instrument Serif',
	]);
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

it.each(THEMES)('defines construction traits for %s', (theme) => {
	expect(THEME_TRAITS[theme]).toBeDefined();
	expect(traitsForTheme(theme)).toEqual({ ...THEME_TRAITS[theme], type: THEME_TYPE[theme] });
});
it('uses default traits for an unknown theme', () => {
	expect(traitsForTheme('nope')).toBe(DEFAULT_TRAITS);
});
it('gives paper and market a tear and bold blank media with a price chip', () => {
	expect(traitsForTheme('paper')).toMatchObject({ tear: true, wordsAlign: 'center' });
	expect(traitsForTheme('market').tear).toBe(true);
	expect(traitsForTheme('bold')).toMatchObject({ priceChip: true, media: 'blank' });
});

it.each(THEMES)('defines the moments for %s', (theme) => {
	expect(THEME_TRAITS[theme].settle).toBe(true);
	expect(THEME_TRAITS[theme].paidFlash).toBe(theme === 'bold');
});

// A link's ink is `--primary`; on these three themes that is the foreground, so the line marks the verb.
it.each(THEMES)(
	'underlines link verbs on %s only where the link ink is the foreground',
	(theme) => {
		expect(THEME_TRAITS[theme].linkUnderline).toBe(['bold', 'paper', 'monochrome'].includes(theme));
	}
);

describe('isThemeName', () => {
	it('accepts every drawn theme and refuses system, unset and unknown names', () => {
		for (const theme of THEMES) expect(isThemeName(theme)).toBe(true);
		expect(isThemeName('system')).toBe(false);
		expect(isThemeName(undefined)).toBe(false);
		expect(isThemeName('sepia')).toBe(false);
	});
});

// The six tables are read off one rule per theme; these are the literals they replaced.
describe('the tables read off the theme rules', () => {
	it('keep the values the hand-kept tables had', () => {
		expect(THEMES).toEqual([
			'light',
			'dark',
			'ocean',
			'sunset',
			'monochrome',
			'paper',
			'warm',
			'bold',
			'market',
		]);
		expect(THEME_TYPE_SET).toEqual({
			light: 'system',
			dark: 'system',
			ocean: 'system',
			sunset: 'system',
			monochrome: 'system',
			paper: 'instrument',
			warm: 'fraunces',
			bold: 'grotesk',
			market: 'manrope',
		});
		expect(THEME_TRAITS).toEqual({
			light: DEFAULT_TRAITS,
			dark: DEFAULT_TRAITS,
			ocean: DEFAULT_TRAITS,
			sunset: DEFAULT_TRAITS,
			monochrome: { ...DEFAULT_TRAITS, linkUnderline: true },
			paper: {
				...DEFAULT_TRAITS,
				media: 'initial',
				wordsAlign: 'center',
				tear: true,
				linkUnderline: true,
			},
			bold: { ...DEFAULT_TRAITS, priceChip: true, paidFlash: true, linkUnderline: true },
			warm: { ...DEFAULT_TRAITS, media: 'initial' },
			market: { ...DEFAULT_TRAITS, media: 'initial', tear: true },
		});
		expect(THEME_ICON_SET).toEqual({
			light: 'tabler',
			dark: 'tabler',
			monochrome: 'tabler',
			ocean: 'phosphor',
			sunset: 'phosphor',
			paper: 'phosphor',
			warm: 'hugeicons',
			bold: 'phosphor',
			market: 'hugeicons',
		});
		expect(LIGHT_THEMES).toEqual(['light', 'paper', 'warm', 'bold', 'market']);
		expect(DARK_RAIL_THEMES).toEqual(['dark', 'ocean', 'sunset', 'monochrome', 'bold', 'market']);
	});
});
