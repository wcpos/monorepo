import * as React from 'react';

import { SafeAreaProviderCompat } from '@react-navigation/elements';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
// import { enableFreeze } from 'react-native-screens';

import { ErrorBoundary } from '@wcpos/components/src/error-boundary';
import { PortalHost } from '@wcpos/components/src/portal';
import { Toast, toastConfig } from '@wcpos/components/src/toast';

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

// import global styles for web
// import '@wcpos/tailwind/dist/styles.css';

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
					fallback={<Splash progress={33} />}
				>
					<AppStateProvider initialProps={initialProps}>
						<React.Suspense
							/**
							 * Second suspense to allow anything else to load that depends on the app state
							 * - translations, theme, etc
							 * - in the future it might be nice to have a loading screen that shows progress for initial load
							 */
							fallback={<Splash progress={66} />}
						>
							<ErrorBoundary>
								<TranslationProvider>
									<SafeAreaProviderCompat style={{ overflow: 'hidden' }}>
										<RootNavigator />
										<ErrorBoundary>
											<PortalHost />
										</ErrorBoundary>
										<ErrorBoundary>
											<Toast config={toastConfig} />
										</ErrorBoundary>
									</SafeAreaProviderCompat>
								</TranslationProvider>
							</ErrorBoundary>
						</React.Suspense>
					</AppStateProvider>
				</React.Suspense>
			</GestureHandlerRootView>
		</ErrorBoundary>
	);
};

export default App;
