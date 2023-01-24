import * as React from 'react';
import { Text } from 'react-native';

import { SafeAreaProviderCompat } from '@react-navigation/elements';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { enableFreeze } from 'react-native-screens';
import { ThemeProvider } from 'styled-components/native';

import ErrorBoundary from '@wcpos/components/src/error-boundary';
import Portal from '@wcpos/components/src/portal';
import { SnackbarProvider } from '@wcpos/components/src/snackbar';
import getTheme from '@wcpos/themes';

import { AuthProvider } from './contexts/auth';
import { LanguageProvider } from './contexts/language';
import { StoreProvider } from './contexts/store';
import RootError from './root-error';
import RootNavigator from './screens/_rootNavigator';

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

	return (
		<ErrorBoundary FallbackComponent={RootError}>
			<React.Suspense fallback={<Text>loading app...</Text>}>
				<GestureHandlerRootView style={{ flex: 1 }}>
					<AuthProvider initialProps={initialProps}>
						<LanguageProvider>
							<StoreProvider>
								<ThemeProvider theme={theme}>
									<ErrorBoundary>
										<SafeAreaProviderCompat style={{ overflow: 'hidden' }}>
											<SnackbarProvider>
												<Portal.Provider>
													<RootNavigator initialProps={initialProps} />
													<Portal.Manager />
												</Portal.Provider>
											</SnackbarProvider>
										</SafeAreaProviderCompat>
									</ErrorBoundary>
								</ThemeProvider>
							</StoreProvider>
						</LanguageProvider>
					</AuthProvider>
				</GestureHandlerRootView>
			</React.Suspense>
		</ErrorBoundary>
	);
};

export default App;
