import { getPhoneSheetListMaxHeight } from './native-popover-sizing';

jest.mock('react-native-safe-area-context', () => ({ SafeAreaInsetsContext: null }));

it('clamps phone sheet lists to the viewport, caps tall screens, and subtracts the bottom inset', () => {
	expect(getPhoneSheetListMaxHeight(600, 0)).toBe(356);
	expect(getPhoneSheetListMaxHeight(1000, 0)).toBe(420);
	expect(getPhoneSheetListMaxHeight(600, 34)).toBe(322);
});
