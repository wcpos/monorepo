import 'react-native-gesture-handler';
import * as React from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Text } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { ThemeProvider } from 'styled-components/native';
import getTheme from '@wcpos/common/src/themes';
import { UserProvider } from './hooks/use-user';
import { SiteProvider } from './hooks/use-site';
import { WpCredentialsProvider } from './hooks/use-wp-credentials';
import { StoreDBProvider } from './hooks/use-store-db';
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

const App = ({ homepage, site, wpCredentials, stores }: InitialProps) => {
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
				<UserProvider>
					<SiteProvider site={site}>
						<WpCredentialsProvider wpCredentials={wpCredentials}>
							<StoreDBProvider stores={stores}>
								<ThemeProvider theme={getTheme('default', 'dark')}>
									<SafeAreaProvider style={{ overflow: 'hidden' }}>
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
									</SafeAreaProvider>
								</ThemeProvider>
							</StoreDBProvider>
						</WpCredentialsProvider>
					</SiteProvider>
				</UserProvider>
			</React.Suspense>
		</ErrorBoundary>
	);
};

export default App;
