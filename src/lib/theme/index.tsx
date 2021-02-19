// import React, { useContext } from 'react';
import normalizeText from './normalize-text';
import defaultTheme from './themes/defaultTheme';

// const ThemeContext = React.createContext({ theme: defaultTheme, changeTheme: () => {} });

// const ThemeProvider = ThemeContext.Provider;
// const ThemeConsumer = ThemeContext.Consumer;

// const useTheme = () => useContext(ThemeContext);
export type ThemeProps = typeof defaultTheme;

export {
	// ThemeConsumer,
	// ThemeContext,
	// ThemeProvider,
	defaultTheme,
	normalizeText,
	// useTheme,
};
