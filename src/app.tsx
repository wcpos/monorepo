import React from 'react';
import { Text } from 'react-native';
import { ThemeProvider } from './hooks/use-theme';
import { AppStateProvider } from './hooks/use-app-state';
import Navigator from './navigators';
import Portal from './components/portal';
import ErrorBoundary from './components/error';

// import i18n
import i18n from './lib/i18n';

const App: React.FC = () => {
	// <React.StrictMode>
	return (
		<ErrorBoundary>
			<React.Suspense fallback={<Text>loading app...</Text>}>
				<AppStateProvider>
					<ThemeProvider>
						<Portal.Host>
							<Navigator />
						</Portal.Host>
					</ThemeProvider>
				</AppStateProvider>
			</React.Suspense>
		</ErrorBoundary>
	);
	// </React.StrictMode>
};

export default App;
