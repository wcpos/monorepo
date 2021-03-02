import 'react-native-gesture-handler';
import * as React from 'react';
import { Text } from 'react-native';
import { ThemeProvider } from './hooks/use-theme';
import { AppStateProvider } from './hooks/use-app-state';
import TranslationService from './services/translation';
// import Navigator from './navigators';
import Portal from './components/portal';
import ErrorBoundary from './components/error';

const i18n = new TranslationService();

const App: React.FC = () => {
	// <React.StrictMode>
	return (
		<ErrorBoundary>
			<React.Suspense fallback={<Text>loading app...</Text>}>
				<AppStateProvider i18n={i18n}>
					<ThemeProvider>
						<Portal.Host>
							<Text>hi</Text>
						</Portal.Host>
					</ThemeProvider>
				</AppStateProvider>
			</React.Suspense>
		</ErrorBoundary>
	);
	// </React.StrictMode>
};

export default App;
