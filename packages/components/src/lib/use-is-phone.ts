import { useWindowDimensions } from 'react-native';

// Mirrors the sm breakpoint in packages/core/src/contexts/theme/use-breakpoint.ts; components cannot import core.
const PHONE_MAX_WIDTH = 640;

export function useIsPhone(): boolean {
	return useWindowDimensions().width < PHONE_MAX_WIDTH;
}
