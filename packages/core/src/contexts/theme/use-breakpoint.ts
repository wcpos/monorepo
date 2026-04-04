import { useWindowDimensions } from 'react-native';

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
	const { width } = useWindowDimensions();
	return getBreakpoint(width);
};
