import React from 'react';
import { useWindowDimensions } from 'react-native';

interface ThemeContextType {
	/**
	 * A desk, or a tablet on its side. Not a layout: the layout is `useIsPhone()` in
	 * `@wcpos/components/lib/device`. A screen may use it to give dense content more room.
	 */
	roomy: boolean;
}

// A tablet standing up is at most 834 wide (1032 for the largest); on its side, 1024 and up.
const ROOMY_MIN_WIDTH = 1024;

const ThemeContext = React.createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
	const roomy = useWindowDimensions().width >= ROOMY_MIN_WIDTH;

	const value = React.useMemo(() => ({ roomy }), [roomy]);

	return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export const useTheme = () => {
	const context = React.useContext(ThemeContext);
	if (!context) {
		throw new Error('useTheme must be used within a ThemeProvider');
	}
	return context;
};
