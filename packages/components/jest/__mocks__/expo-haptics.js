/**
 * expo-haptics ships ESM only. Every pressable surface (rows, tiles, buttons) imports it through
 * `lib/haptics`, so a suite would fail to load without a per-file mock. Haptics are a native side
 * effect with no rendered result: here they resolve and do nothing. A suite that asserts a haptic
 * still mocks the module itself.
 */
module.exports = {
	impactAsync: () => Promise.resolve(),
	notificationAsync: () => Promise.resolve(),
	selectionAsync: () => Promise.resolve(),
	ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy' },
};
