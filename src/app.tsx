import React from 'react';
import { ThemeProvider } from 'styled-components/native';
import { UserProvider } from './hooks/use-user';
import { StoreProvider } from './hooks/use-store';
import { UiProvider } from './hooks/use-ui';
import Navigator from './navigators';
import ActivityIndicator from './components/activity-indicator';
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
		<React.Suspense fallback={<ActivityIndicator />}>
			<UserProvider>
				<StoreProvider>
					<ThemeProvider theme={defaultTheme}>
						<UiProvider>
							<Portal.Host>
								<Navigator />
							</Portal.Host>
						</UiProvider>
					</ThemeProvider>
				</StoreProvider>
			</UserProvider>
		</React.Suspense>
	</ErrorBoundary>
	// </React.StrictMode>
);

export default App;
