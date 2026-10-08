import { Platform } from 'react-native';

import * as Haptics from 'expo-haptics';

/**
 * One light tick: a gesture crossed a line (the cart row's remove point, both ways). Native
 * only; the web has no haptics and expo-haptics rejects there, which nobody needs to see.
 */
export function hapticTick(): void {
	if (Platform.OS === 'web') return;
	void Haptics.selectionAsync().catch(() => {});
}
