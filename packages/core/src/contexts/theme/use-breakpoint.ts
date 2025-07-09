import { useEffect, useState } from 'react';
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

export const useBreakpoint = (): Breakpoint => {
	// Initialize state with the current breakpoint
	const [breakpoint, setBreakpoint] = useState<Breakpoint>(() =>
		getBreakpoint(Dimensions.get('window').width)
	);

	useEffect(() => {
		// Listen to dimension changes and update the state directly
		const subscription = Dimensions.addEventListener('change', ({ window }) => {
			const newBreakpoint = getBreakpoint(window.width);
			setBreakpoint((currentBreakpoint) => {
				// Only update if the breakpoint actually changed
				if (currentBreakpoint !== newBreakpoint) {
					return newBreakpoint;
				}
				return currentBreakpoint;
			});
		});

		return () => subscription?.remove();
	}, []); // Empty dependency array since we only want to set up the listener once

	return breakpoint;
};
