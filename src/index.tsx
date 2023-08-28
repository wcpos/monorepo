import * as React from 'react';

import { SafeAreaProviderCompat } from '@react-navigation/elements';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { enableFreeze } from 'react-native-screens';
import { ThemeProvider } from 'styled-components/native';

import ErrorBoundary from '@wcpos/components/src/error-boundary';
import Portal from '@wcpos/components/src/portal';
import { SnackbarProvider } from '@wcpos/components/src/snackbar';
import getTheme from '@wcpos/themes';

import { AppStateProvider } from './contexts/app-state';
import { StoreStateManagerProvider } from './contexts/store-state-manager';
import { TranslationProvider } from './contexts/translations';
import RootError from './root-error';
import RootNavigator from './screens';
import Splash from './screens/splash';
// import WarningMessage from './warning-message';

// import polyfills
import 'setimmediate'; // https://github.com/software-mansion/react-native-reanimated/issues/4140

// enable freeze
enableFreeze(true);

/**
 *
 */
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
				<AppStateProvider>
					<React.Suspense fallback={<Splash />}>
						<StoreStateManagerProvider>
							<ThemeProvider theme={theme}>
								<ErrorBoundary>
									<TranslationProvider>
										<SafeAreaProviderCompat style={{ overflow: 'hidden' }}>
											<SnackbarProvider>
												<Portal.Provider>
													<RootNavigator />
													<Portal.Manager />
												</Portal.Provider>
											</SnackbarProvider>
										</SafeAreaProviderCompat>
									</TranslationProvider>
								</ErrorBoundary>
							</ThemeProvider>
						</StoreStateManagerProvider>
					</React.Suspense>
				</AppStateProvider>
			</GestureHandlerRootView>
		</ErrorBoundary>
	);
};

export default App;
