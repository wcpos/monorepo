import 'react-native-gesture-handler';
import * as React from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Text } from 'react-native';
import { NavigationContainer, useLinking, NavigationContainerRef } from '@react-navigation/native';
import { ThemeProvider } from 'styled-components/native';
import { AppStateProvider } from './hooks/use-app-state';
import TranslationService from './services/translation';
import AppNavigator from './navigators';
import Portal from './components/portal';
import ErrorBoundary from './components/error';
import SplashScreen from './screens/splash';
import Platform from './lib/platform';
import { AppProviderSizeProvider } from './hooks/use-position-in-app';

const i18n = new TranslationService();
const prefixes =
	Platform.OS === 'android' || Platform.OS === 'ios' ? 'wcpos://' : (window as any).location.origin;
const routes = {
	Auth: 'connect',
	Main: {
		path: '',
		screens: {
			POS: {
				path: '',
			},
			Products: {
				path: 'products',
			},
			Orders: {
				path: 'orders',
			},
			Customers: {
				path: 'customers',
			},
			Support: {
				path: 'support',
			},
		},
	},
};

const App = () => {
	const navigationRef = React.useRef<NavigationContainerRef>(null);
	const [isNavReady, setNavIsReady] = React.useState(false);
	const [initialNavState, setInitialNavState] = React.useState<any>();

	/**
	 * Deep linking for react-navigation
	 */
	const { getInitialState } = useLinking(navigationRef, {
		prefixes: [prefixes],
		config: { screens: routes },
	});

	React.useEffect(() => {
		(async () => {
			try {
				const state = await getInitialState();
				if (state !== undefined) {
					setInitialNavState(state);
				}
			} catch (e) {
				console.warn(e);
			} finally {
				setNavIsReady(true);
			}
		})();
	}, [getInitialState]);

	return (
		// <React.StrictMode>
		<ErrorBoundary>
			<React.Suspense fallback={<Text>loading app...</Text>}>
				{/* @TODO - suspend AppStateProvider until state is ready */}
				<AppStateProvider i18n={i18n}>
					{(isAppStateReady: boolean, theme: any) => (
						<ThemeProvider theme={theme}>
							<SafeAreaProvider>
								<AppProviderSizeProvider>
									<Portal.Provider>
										{isAppStateReady && isNavReady ? (
											<NavigationContainer ref={navigationRef} initialState={initialNavState}>
												<AppNavigator />
											</NavigationContainer>
										) : (
											<SplashScreen />
										)}
										<Portal.Manager />
									</Portal.Provider>
								</AppProviderSizeProvider>
							</SafeAreaProvider>
						</ThemeProvider>
					)}
				</AppStateProvider>
			</React.Suspense>
		</ErrorBoundary>
		// </React.StrictMode>
	);
};

export default App;
