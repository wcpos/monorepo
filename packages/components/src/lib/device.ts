import * as React from 'react';
import { Platform, useWindowDimensions } from 'react-native';

// Mirrors the sm breakpoint in packages/core/src/contexts/theme/use-breakpoint.ts; components cannot import core.
const PHONE_MAX_WIDTH = 640;

export function useIsPhone(): boolean {
	return useWindowDimensions().width < PHONE_MAX_WIDTH;
}

export function usePointer(): 'fine' | 'coarse' {
	const queries = React.useMemo(() => {
		if (Platform.OS !== 'web' || typeof window === 'undefined') return [];
		return [window.matchMedia('(pointer: fine)'), window.matchMedia('(hover: hover)')];
	}, []);
	const subscribe = React.useCallback(
		(notify: () => void) => {
			queries.forEach((query) => query.addEventListener('change', notify));
			return () => queries.forEach((query) => query.removeEventListener('change', notify));
		},
		[queries]
	);
	return React.useSyncExternalStore(
		subscribe,
		() => (queries.length === 2 && queries.every((query) => query.matches) ? 'fine' : 'coarse'),
		() => 'coarse'
	);
}
