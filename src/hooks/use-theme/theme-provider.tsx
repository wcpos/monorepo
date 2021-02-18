import * as React from 'react';
import { ThemeProvider as StyledComponentsThemeProvider } from 'styled-components/native';
import defaultTheme from './themes/defaultTheme';

type Props = {
	children: React.ReactNode;
};

// @ts-ignore
export const ThemeContext = React.createContext({ switchTheme: (args) => {} });

/**
 *
 */
const ThemeProvider: React.FC<Props> = ({ children }) => {
	const [theme, setTheme] = React.useState(defaultTheme);

	// @ts-ignore
	const switchTheme = (args): void => {
		console.log(...args);
	};

	return (
		<StyledComponentsThemeProvider theme={theme}>
			<ThemeContext.Provider value={{ switchTheme }}>{children}</ThemeContext.Provider>
		</StyledComponentsThemeProvider>
	);
};

export default ThemeProvider;
