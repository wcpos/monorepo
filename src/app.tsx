import 'react-native-gesture-handler';
import * as React from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Text } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { ThemeProvider } from 'styled-components/native';
import { AppStateProvider } from './hooks/use-app-state';
import TranslationService from './services/translation';
import AppNavigator from './navigators';
import Portal from './components/portal';
import ErrorBoundary from './components/error-boundary';
import SplashScreen from './screens/splash';
import Url from './lib/url-parse';
import { AppProviderSizeProvider } from './hooks/use-position-in-app';
import { SnackbarProvider } from './components/snackbar/snackbar-provider';
import { AuthLoginProvider } from './hooks/use-auth-login';

const i18n = new TranslationService();

interface IntialProps {
	homepage?: string;
}

const App = ({ homepage }: IntialProps) => {
	const prefixes = ['wcpos://'];
	let pathname = '';

	if (homepage) {
		const parsedUrl = new Url(homepage);
		prefixes.push(parsedUrl.host);
		pathname = parsedUrl.pathname;
	}

	const linking = {
		prefixes,
		config: {
			screens: {
				Auth: `${pathname}/login`,
				Main: {
					path: pathname,
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
				Modal: '#',
			},
		},
	};

	return (
		<ErrorBoundary>
			<React.Suspense fallback={<Text>loading app...</Text>}>
				{/* @TODO - suspend AppStateProvider until state is ready */}
				<AppStateProvider i18n={i18n}>
					{(isAppStateReady: boolean, theme: any) => (
						<ThemeProvider theme={theme}>
							<SafeAreaProvider style={{ overflow: 'hidden' }}>
								<AppProviderSizeProvider>
									<SnackbarProvider>
										<Portal.Provider>
											{isAppStateReady ? (
												<NavigationContainer linking={linking}>
													<AuthLoginProvider>
														<AppNavigator />
													</AuthLoginProvider>
												</NavigationContainer>
											) : (
												<SplashScreen />
											)}
											<Portal.Manager />
										</Portal.Provider>
									</SnackbarProvider>
								</AppProviderSizeProvider>
							</SafeAreaProvider>
						</ThemeProvider>
					)}
				</AppStateProvider>
			</React.Suspense>
		</ErrorBoundary>
	);
};

export default App;
