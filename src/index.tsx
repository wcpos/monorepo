import * as React from 'react';

import { SafeAreaProviderCompat } from '@react-navigation/elements';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { enableFreeze } from 'react-native-screens';
import { ThemeProvider } from 'styled-components/native';

import ErrorBoundary from '@wcpos/components/src/error-boundary';
import Portal from '@wcpos/components/src/portal';
import { SnackbarProvider } from '@wcpos/components/src/snackbar';
import getTheme from '@wcpos/themes';

import { LocalDataProvider } from './contexts/local-data';
import RootError from './root-error';
import RootNavigator from './screens';
import Splash from './screens/splash';

// enable freeze
enableFreeze(true);

type InitialProps = import('./types').InitialProps;

let initialProps = {};
if (window) {
	initialProps = window.initialProps as InitialProps;
}

const App = () => {
	const theme = React.useMemo(
		() =>
			getTheme({
				name: 'default',
				mode: 'light',
			}),
		[]
	);

	/**
	 * NOTE:
	 * The first ErrorBoundary is a catchall, it should use only pure React Native,
	 * ie: it is not dependent on theme or custom components
	 * The second ErrorBoundary uses the theme and custom components
	 */
	return (
		<ErrorBoundary FallbackComponent={RootError}>
			<GestureHandlerRootView style={{ flex: 1 }}>
				<LocalDataProvider initialProps={initialProps}>
					<ThemeProvider theme={theme}>
						<ErrorBoundary>
							<React.Suspense fallback={<Splash />}>
								<SafeAreaProviderCompat style={{ overflow: 'hidden' }}>
									<SnackbarProvider>
										<Portal.Provider>
											<RootNavigator initialProps={initialProps} />
											<Portal.Manager />
										</Portal.Provider>
									</SnackbarProvider>
								</SafeAreaProviderCompat>
							</React.Suspense>
						</ErrorBoundary>
					</ThemeProvider>
				</LocalDataProvider>
			</GestureHandlerRootView>
		</ErrorBoundary>
	);
};

export default App;
