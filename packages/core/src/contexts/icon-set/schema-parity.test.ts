/**
 * The stores schema spells the set ids out (the database package cannot import
 * components), so this is the only thing that fails when the two drift — for
 * example at the cut from eight families to three.
 */
import { ICON_SET_IDS, ICON_SETTING_AUTO } from '@wcpos/components/icon';
import { storesLiteral } from '@wcpos/database/collections/schemas/stores';

jest.mock('uniwind', () => ({ useCSSVariable: () => '#000000' }));
jest.mock('react-native-svg', () => {
	const elements = jest.requireActual('react-native-svg/lib/commonjs/elements.web');
	return { ...elements, default: elements.Svg, __esModule: true };
});

it('keeps the store schema enum in step with the set registry', () => {
	expect([...storesLiteral.properties.icons.enum]).toEqual(['auto', ...ICON_SET_IDS]);
	expect(storesLiteral.properties.icons.default).toBe(ICON_SETTING_AUTO);
});
