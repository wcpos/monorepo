import 'react-native-gesture-handler';
import * as React from 'react';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { Text } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { ThemeProvider } from 'styled-components/native';
import { StatusBar } from 'expo-status-bar';
import get from 'lodash/get';
import getTheme from '@wcpos/common/src/themes';
import { AppStateProvider } from './hooks/use-app-state';
import TranslationService from './services/translation';
import AppNavigator from './navigators';
import Portal from './components/portal';
import ErrorBoundary from './components/error-boundary';
// import SplashScreen from './screens/splash';
import Url from './lib/url-parse';
import { AppProviderSizeProvider } from './hooks/use-position-in-app';
import { SnackbarProvider } from './components/snackbar/snackbar-provider';
// import { AuthLoginProvider } from './hooks/use-auth-login';

const i18n = new TranslationService();

type InitialProps = import('./types').InitialProps;

const App = (initialProps: InitialProps) => {
	const homepage = get(initialProps, 'homepage');
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
				<AppStateProvider initialProps={initialProps}>
					<ThemeProvider theme={getTheme('default', 'dark')}>
						<SafeAreaProvider style={{ overflow: 'hidden' }}>
							<SafeAreaView style={{ height: '100%', backgroundColor: 'black' }}>
								<AppProviderSizeProvider>
									<SnackbarProvider>
										<Portal.Provider>
											<NavigationContainer linking={linking}>
												<AppNavigator />
											</NavigationContainer>
											<Portal.Manager />
										</Portal.Provider>
									</SnackbarProvider>
								</AppProviderSizeProvider>
							</SafeAreaView>
						</SafeAreaProvider>
					</ThemeProvider>
				</AppStateProvider>
			</React.Suspense>
			<StatusBar style="light" />
		</ErrorBoundary>
	);
};

export default App;
