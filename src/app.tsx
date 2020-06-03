import React from 'react';
import { Text } from 'react-native';
import { ThemeProvider } from 'styled-components/native';
import { DatabaseProvider } from './hooks/use-database';
import Navigator from './navigators';
import Portal from './components/portal';
import { defaultTheme } from './lib/theme';
import ErrorBoundary from './components/error';

// import i18n
import i18n from './lib/i18n';

//
import 'react-native-gesture-handler';

const App = () => (
	// <React.StrictMode>
	<ErrorBoundary>
		<React.Suspense fallback={<Text>loading app...</Text>}>
			<DatabaseProvider>
				<ThemeProvider theme={defaultTheme}>
					<Portal.Host>
						<Navigator />
					</Portal.Host>
				</ThemeProvider>
			</DatabaseProvider>
		</React.Suspense>
	</ErrorBoundary>
	// </React.StrictMode>
);

export default App;
