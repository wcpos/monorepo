import * as React from 'react';
import { ThemeProvider as StyledComponentsThemeProvider } from 'styled-components/native';
import noop from 'lodash/noop';
import defaultTheme from './themes/defaultTheme';

export const ThemeContext = React.createContext({ switchTheme: noop });

/**
 *
 */
const ThemeProvider: React.FC = ({ children }) => {
	const [theme, setTheme] = React.useState(defaultTheme);

	const switchTheme = (args: any[]) => {
		console.log(...args);
	};

	return (
		<StyledComponentsThemeProvider theme={theme}>
			<ThemeContext.Provider value={{ switchTheme }}>{children}</ThemeContext.Provider>
		</StyledComponentsThemeProvider>
	);
};

export default ThemeProvider;
