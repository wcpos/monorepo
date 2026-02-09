import React from 'react';

import { useBreakpoint } from './use-breakpoint';

import type { Breakpoint } from './use-breakpoint';

interface ThemeContextType {
	screenSize: Breakpoint;
}

const ThemeContext = React.createContext<ThemeContextType | undefined>(undefined);

export const ThemeProvider = ({ children }: { children: React.ReactNode }) => {
	const screenSize = useBreakpoint();

	const value = React.useMemo(() => ({ screenSize }), [screenSize]);

	return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};

export const useTheme = () => {
	const context = React.useContext(ThemeContext);
	if (!context) {
		throw new Error('useTheme must be used within a ThemeProvider');
	}
	return context;
};
