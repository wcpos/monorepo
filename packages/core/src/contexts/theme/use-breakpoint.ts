import * as React from 'react';
import { Dimensions } from 'react-native';

// Define the possible breakpoints
export type Breakpoint = 'sm' | 'md' | 'lg';

// Helper function to compute breakpoint based on width
const getBreakpoint = (width: number): Breakpoint => {
	if (width >= 1024) {
		return 'lg';
	} else if (width < 640) {
		return 'sm';
	} else {
		return 'md';
	}
};

const subscribe = (callback: () => void) => {
	const subscription = Dimensions.addEventListener('change', callback);
	return () => subscription.remove();
};

const getSnapshot = () => getBreakpoint(Dimensions.get('window').width);

export const useBreakpoint = (): Breakpoint => React.useSyncExternalStore(subscribe, getSnapshot);
