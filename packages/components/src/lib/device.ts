import * as React from 'react';
import { Platform, useWindowDimensions } from 'react-native';

/**
 * The one layout boundary (owner, 2026-10-02). A window at least this wide AND this tall gets
 * the navigation rail and the register's two columns; anything smaller gets the phone layout
 * (tabs). There is no layout in between.
 *
 * 768 is the narrowest tablet where the two columns hold (shot on the real register,
 * 2026-10-02): every iPad except the mini in portrait, and every 10–11" Android tablet. At 744
 * (iPad mini, portrait) the cart column is too narrow to show an item's name.
 */
export const WIDE_MIN_WIDTH = 768;
/**
 * A phone on its side is 844–932 wide but only 390–430 tall: wide enough for two columns and
 * too short to show a cart line under them. The shortest tablet on its side is 600.
 */
export const WIDE_MIN_HEIGHT = 480;

export function isPhoneWindow({ width, height }: { width: number; height: number }): boolean {
	return width < WIDE_MIN_WIDTH || height < WIDE_MIN_HEIGHT;
}

type DeviceOverride = { phone?: boolean; pointer?: 'fine' | 'coarse' };
const DeviceContext = React.createContext<DeviceOverride>({});

export function DeviceScope({ phone, pointer, children }: React.PropsWithChildren<DeviceOverride>) {
	const parent = React.useContext(DeviceContext);
	const value = { phone: phone ?? parent.phone, pointer: pointer ?? parent.pointer };
	return React.createElement(DeviceContext.Provider, { value }, children);
}

export function useIsPhone(): boolean {
	const override = React.useContext(DeviceContext);
	const window = useWindowDimensions();
	return override.phone ?? isPhoneWindow(window);
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
