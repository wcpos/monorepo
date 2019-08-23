import React from 'react';
import { ThemeProvider } from 'styled-components/native';
import { DatabaseProvider } from './hooks/use-database';
import Navigator from './navigators';
import ActivityIndicator from './components/activity-indicator';
import { defaultTheme } from './lib/theme';

// import i18n
import i18n from './lib/i18n';

const App = () => (
	// <React.StrictMode>
	<React.Suspense fallback={<ActivityIndicator />}>
		<DatabaseProvider>
			<ThemeProvider theme={defaultTheme}>
				<Navigator />
			</ThemeProvider>
		</DatabaseProvider>
	</React.Suspense>
	// </React.StrictMode>
);

export default App;
