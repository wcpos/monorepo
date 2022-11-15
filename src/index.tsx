import * as React from 'react';
import { Text, useWindowDimensions } from 'react-native';

import { SafeAreaProviderCompat } from '@react-navigation/elements';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { enableFreeze } from 'react-native-screens';
import { ThemeProvider } from 'styled-components/native';

import ErrorBoundary from '@wcpos/components/src/error-boundary';
import Portal from '@wcpos/components/src/portal';
import { SnackbarProvider } from '@wcpos/components/src/snackbar';
import getTheme from '@wcpos/themes';

import { AuthProvider } from './contexts/auth';
import { StoreProvider } from './contexts/store';
import { translationsResource } from './lib/translations';
import RootError from './root-error';
import RootNavigator from './screens';

// enable freeze
enableFreeze(true);

type InitialProps = import('./types').InitialProps;

let initialProps = {};
if (window) {
	initialProps = window.initialProps as InitialProps;
}

const App = () => {
	const dimensions = useWindowDimensions();
	const theme = React.useMemo(
		() =>
			getTheme({
				name: 'default',
				mode: 'light',
				dimensions,
			}),
		[dimensions]
	);

	return (
		<ErrorBoundary FallbackComponent={RootError}>
			<React.Suspense fallback={<Text>loading app...</Text>}>
				<GestureHandlerRootView style={{ flex: 1 }}>
					<AuthProvider initialProps={{ ...initialProps, translationsResource }}>
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
					</AuthProvider>
				</GestureHandlerRootView>
			</React.Suspense>
		</ErrorBoundary>
	);
};

export default App;
