import * as React from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProviderCompat } from '@react-navigation/elements';
import { Text, useWindowDimensions } from 'react-native';
import { ThemeProvider } from 'styled-components/native';
import { enableFreeze } from 'react-native-screens';
import getTheme from '@wcpos/themes';
import ErrorBoundary from '@wcpos/components/src/error-boundary';
import { AuthProvider } from '@wcpos/hooks/src/use-auth';
import Portal from '@wcpos/components/src/portal';
import { SnackbarProvider } from '@wcpos/components/src/snackbar';
import TranslationService from './services/translation';
import RootNavigator from './screens';
// import SplashScreen from './screens/splash';
import RootError from './root-error';

// enable freeze
enableFreeze(true);

const i18n = new TranslationService();

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
					<AuthProvider initialProps={initialProps}>
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
					</AuthProvider>
				</GestureHandlerRootView>
			</React.Suspense>
		</ErrorBoundary>
	);
};

export default App;
