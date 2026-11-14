/**
 * expo-haptics ships ESM only. Every Button (and every shared row that renders one) imports it,
 * so a screen suite would fail to load without a per-file mock. Haptics are a native side
 * effect with no rendered result: here they resolve and do nothing.
 */
module.exports = {
	impactAsync: () => Promise.resolve(),
	notificationAsync: () => Promise.resolve(),
	selectionAsync: () => Promise.resolve(),
	ImpactFeedbackStyle: {
		Light: 'light',
		Medium: 'medium',
		Heavy: 'heavy',
		Soft: 'soft',
		Rigid: 'rigid',
	},
	NotificationFeedbackType: { Success: 'success', Warning: 'warning', Error: 'error' },
};
