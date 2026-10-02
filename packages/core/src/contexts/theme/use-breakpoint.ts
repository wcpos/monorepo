import { useWindowDimensions } from 'react-native';

import { isPhoneWindow } from '@wcpos/components/lib/device';

/**
 * Two layouts and nothing in between (owner, 2026-10-02): `sm` is the phone layout (tabs),
 * `lg` is the navigation rail with the register's two columns. The boundary lives in
 * `@wcpos/components/lib/device`.
 */
export type Breakpoint = 'sm' | 'lg';

export const useBreakpoint = (): Breakpoint => {
	const window = useWindowDimensions();
	return isPhoneWindow(window) ? 'sm' : 'lg';
};
