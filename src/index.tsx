import * as React from 'react';

import { SafeAreaProviderCompat } from '@react-navigation/elements';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
// import { enableFreeze } from 'react-native-screens';
import { ThemeProvider } from 'styled-components/native';

import ErrorBoundary from '@wcpos/components/src/error-boundary';
import Portal from '@wcpos/components/src/portal';
import { SnackbarProvider } from '@wcpos/components/src/snackbar';
import getTheme from '@wcpos/themes';

import { AppStateProvider } from './contexts/app-state';
import { TranslationProvider } from './contexts/translations';
import RootError from './root-error';
import RootNavigator from './screens';
import Splash from './screens/splash';
// import WarningMessage from './warning-message';

// import polyfills
import 'setimmediate'; // https://github.com/software-mansion/react-native-reanimated/issues/4140
// import './polyfills';

// enable freeze
// enableFreeze(true);

/**
 * Initial Props
 * - only web at the moment, but may be useful for other platforms in the future
 */
let initialProps: Record<string, unknown> = {};
if (window && window.initialProps) {
	initialProps = Object.freeze(window.initialProps); // prevent accidental mutation
}

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
				<React.Suspense
					/**
					 * First suspense to load the initial app state
					 * - we now have site, user, store, etc if the user is logged in
					 */
					fallback={<Splash />}
				>
					<AppStateProvider initialProps={initialProps}>
						<React.Suspense
							/**
							 * Second suspense to allow anything else to load that depends on the app state
							 * - translations, theme, etc
							 * - in the future it might be nice to have a loading screen that shows progress for initial load
							 */
							fallback={<Splash />}
						>
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
						</React.Suspense>
					</AppStateProvider>
				</React.Suspense>
			</GestureHandlerRootView>
		</ErrorBoundary>
	);
};

export default App;
