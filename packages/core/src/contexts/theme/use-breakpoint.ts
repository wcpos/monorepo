import { useState, useEffect } from 'react';
import { Dimensions } from 'react-native';

import { useSharedValue, useAnimatedReaction, runOnJS } from 'react-native-reanimated';

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
	// Initialise state and shared value with the current breakpoint
	const initialBreakpoint = getBreakpoint(Dimensions.get('window').width);
	const [breakpoint, setBreakpoint] = useState<Breakpoint>(initialBreakpoint);
	const breakpointShared = useSharedValue<Breakpoint>(initialBreakpoint);

	useEffect(() => {
		// Listen to dimension changes and update the shared value accordingly
		const subscription = Dimensions.addEventListener('change', ({ window }) => {
			const newBreakpoint = getBreakpoint(window.width);
			breakpointShared.value = newBreakpoint;
		});
		return () => subscription?.remove();
	}, [breakpointShared]);

	// Use reanimated's worklet to only update the state when the breakpoint changes
	useAnimatedReaction(
		() => breakpointShared.value,
		(current, previous) => {
			if (current !== previous) {
				// Run on the JS thread to update the state
				runOnJS(setBreakpoint)(current);
			}
		}
	);

	return breakpoint;
};
