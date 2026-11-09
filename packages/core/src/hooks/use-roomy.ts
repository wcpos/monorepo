import { useWindowDimensions } from 'react-native';

// A tablet standing up is at most 834 wide (1032 for the largest); on its side, 1024 and up.
const ROOMY_MIN_WIDTH = 1024;

/**
 * A desk, or a tablet on its side. Not a layout: the layout is `useIsPhone()` in
 * `@wcpos/components/lib/device`. A screen may use it to give dense content more room.
 */
export function useRoomy(): boolean {
	return useWindowDimensions().width >= ROOMY_MIN_WIDTH;
}
