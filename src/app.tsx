import React from 'react';
import DatabaseProvider from '@nozbe/watermelondb/DatabaseProvider';
import { ThemeProvider } from 'styled-components/native';
import database from './database';
import Navigator from './navigators';
import ActivityIndicator from './components/activity-indicator';
import { defaultTheme } from './lib/theme';

// import i18n
import i18n from './lib/i18n';

const App = () => (
	// <React.StrictMode>
	<React.Suspense fallback={<ActivityIndicator />}>
		<DatabaseProvider database={database}>
			<ThemeProvider theme={defaultTheme}>
				<Navigator />
			</ThemeProvider>
		</DatabaseProvider>
	</React.Suspense>
	// </React.StrictMode>
);

export default App;
