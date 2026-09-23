import { Platform } from 'react-native';

const isWeb = Platform.OS === 'web';

/**
 * On web a Radix item (a `Select.Item`, a menu item) is a Radix node, not a react-native-web
 * Pressable, so nothing translates `testID` into the `data-testid` that RNW gives every other
 * control — the prop reaches the DOM as an inert `testid` attribute and no test can address
 * the option. Selecting the option by its visible text instead is not available to us: the
 * labels are translated, and the repo forbids localized text as an E2E selector. So a Radix
 * item spreads this next to its props. The platform page's test-id helper (wcpos/roadmap#290).
 */
export function webTestID(testID?: string): { 'data-testid'?: string } {
	return isWeb && testID ? { 'data-testid': testID } : {};
}
