import * as React from 'react';
import { Platform, useWindowDimensions } from 'react-native';

// Mirrors the sm breakpoint in packages/core/src/contexts/theme/use-breakpoint.ts; components cannot import core.
const PHONE_MAX_WIDTH = 640;

type DeviceOverride = { phone?: boolean; pointer?: 'fine' | 'coarse' };
const DeviceContext = React.createContext<DeviceOverride>({});

export function DeviceScope({ phone, pointer, children }: React.PropsWithChildren<DeviceOverride>) {
	const parent = React.useContext(DeviceContext);
	const value = { phone: phone ?? parent.phone, pointer: pointer ?? parent.pointer };
	return React.createElement(DeviceContext.Provider, { value }, children);
}

export function useIsPhone(): boolean {
	const override = React.useContext(DeviceContext);
	const { width } = useWindowDimensions();
	return override.phone ?? width < PHONE_MAX_WIDTH;
}

export function usePointer(): 'fine' | 'coarse' {
	const override = React.useContext(DeviceContext);
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
	const pointer = React.useSyncExternalStore<'fine' | 'coarse'>(
		subscribe,
		() => (queries.length === 2 && queries.every((query) => query.matches) ? 'fine' : 'coarse'),
		() => 'coarse'
	);
	return override.pointer ?? pointer;
}
