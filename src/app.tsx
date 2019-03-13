import React from 'react';
import { Provider as DatabaseProvider } from './hooks/use-database';
// import DatabaseProvider from '@nozbe/watermelondb/DatabaseProvider';
import { ThemeProvider } from 'styled-components/native';
import database from './database';
import Navigator from './navigators';
import { defaultTheme } from './lib/theme';

// import i18n
import i18n from './lib/i18n';

const App = () => (
	<DatabaseProvider value={database}>
		<ThemeProvider theme={defaultTheme}>
			<Navigator />
		</ThemeProvider>
	</DatabaseProvider>
);

export default App;
