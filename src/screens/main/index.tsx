import * as React from 'react';
import { useWindowDimensions } from 'react-native';

import { createDrawerNavigator } from '@react-navigation/drawer';
import { createStackNavigator } from '@react-navigation/stack';
import { useObservableEagerState } from 'observable-hooks';
import { isRxDatabase } from 'rxdb';

import { ErrorBoundary } from '@wcpos/components/src/error-boundary';
import { Icon } from '@wcpos/components/src/icon';
import { Suspense } from '@wcpos/components/src/suspense';
import { OnlineStatusProvider } from '@wcpos/hooks/src/use-online-status';
import { QueryProvider, useQuery } from '@wcpos/query';

import DrawerContent from './components/drawer-content';
import Header from './components/header';
import { ExtraDataProvider } from './contexts/extra-data';
import { UISettingsProvider } from './contexts/ui-settings';
import { Errors } from './errors';
import useKeyboardShortcuts from './hooks/use-keyboard-shortcuts';
import { useLicense } from './hooks/use-license';
import { useRestHttpClient } from './hooks/use-rest-http-client';
import { Login } from './login';
import LogsWithProviders from './logs';
import { PageUpgrade } from './page-upgrade';
import POSNavigator from './pos';
// import ReportsNavigator from './reports';
import { SettingsTabs } from './settings';
import Support from './support';
import { TaxRates } from './tax-rates';
import { UpgradeRequired } from './upgrade-required';
import { useAppState } from '../../contexts/app-state';
import { useT } from '../../contexts/translations';
import { useLocale } from '../../hooks/use-locale';
import { useVersionCheck } from '../../hooks/use-version-check';

const CustomersNavigator = React.lazy(() => import('./customers'));
const OrdersNavigator = React.lazy(() => import('./orders'));
const ProductsNavigator = React.lazy(() => import('./products'));
const ReportsNavigator = React.lazy(() => import('./reports'));

export type MainStackParamList = {
	MainDrawer: undefined;
	Settings: undefined;
	Login: undefined;
	TaxRates: undefined;
};

const Stack = createStackNavigator<MainStackParamList>();

export type DrawerParamList = {
	POSStack: undefined;
	ProductsStack: undefined;
	OrdersStack: undefined;
	CustomersStack: undefined;
	ReportsStack: undefined;
	LogsStack: undefined;
	SupportStack: undefined;
};

const Drawer = createDrawerNavigator<DrawerParamList>();

/**
 *
 */
const DrawerNavigator = ({ navigation }) => {
	const dimensions = useWindowDimensions();
	useKeyboardShortcuts(); // allows navigation by hotkeys
	const t = useT();
	const { isPro } = useLicense();
	const [showUpgrade, setShowUpgrade] = React.useState(!isPro);

	const largeScreen = dimensions.width >= 1024;

	return (
		<Drawer.Navigator
			initialRouteName="POSStack"
			screenOptions={{
				header: (props) => (
					<Header {...props} showUpgrade={showUpgrade} setShowUpgrade={setShowUpgrade} />
				),
				drawerType: largeScreen ? 'permanent' : 'front',
				drawerStyle: {
					backgroundColor: '#243B53',
					width: largeScreen ? 'auto' : undefined,
					borderRightColor: 'rgba(0, 0, 0, 0.2)',
					// borderRightWidth: 0,
				},
				sceneContainerStyle: { height: '100%' }, // important to set height to 100% to avoid scrolling
				// unmountOnBlur: true,
			}}
			drawerContent={(props) => <DrawerContent {...props} largeScreen={largeScreen} />}
		>
			<Drawer.Screen
				name="POSStack"
				options={{
					title: t('POS', { _tags: 'core' }),
					drawerLabel: t('POS', { _tags: 'core' }),
					drawerIcon: ({ focused }) => (
						<Icon size="xl" name="cashRegister" className={focused && 'text-primary'} />
					),
				}}
			>
				{(props) => (
					<ErrorBoundary>
						<Suspense>
							<POSNavigator {...props} />
						</Suspense>
					</ErrorBoundary>
				)}
			</Drawer.Screen>
			<Drawer.Screen
				name="ProductsStack"
				options={{
					title: t('Products', { _tags: 'core' }),
					drawerLabel: t('Products', { _tags: 'core' }),
					drawerIcon: ({ focused }) => (
						<Icon size="xl" name="gifts" className={focused && 'text-primary'} />
					),
				}}
			>
				{(props) =>
					isPro ? (
						<ErrorBoundary>
							<Suspense>
								<ProductsNavigator {...props} />
							</Suspense>
						</ErrorBoundary>
					) : (
						<PageUpgrade page="products" />
					)
				}
			</Drawer.Screen>
			<Drawer.Screen
				name="OrdersStack"
				options={{
					title: t('Orders', { _tags: 'core' }),
					drawerLabel: t('Orders', { _tags: 'core' }),
					drawerIcon: ({ focused }) => (
						<Icon size="xl" name="receipt" className={focused && 'text-primary'} />
					),
				}}
			>
				{(props) =>
					isPro ? (
						<ErrorBoundary>
							<Suspense>
								<OrdersNavigator {...props} />
							</Suspense>
						</ErrorBoundary>
					) : (
						<PageUpgrade page="orders" />
					)
				}
			</Drawer.Screen>
			<Drawer.Screen
				name="CustomersStack"
				options={{
					title: t('Customers', { _tags: 'core' }),
					drawerLabel: t('Customers', { _tags: 'core' }),
					drawerIcon: ({ focused }) => (
						<Icon size="xl" name="users" className={focused && 'text-primary'} />
					),
				}}
			>
				{(props) =>
					isPro ? (
						<ErrorBoundary>
							<Suspense>
								<CustomersNavigator {...props} />
							</Suspense>
						</ErrorBoundary>
					) : (
						<PageUpgrade page="customers" />
					)
				}
			</Drawer.Screen>
			<Drawer.Screen
				name="ReportsStack"
				options={{
					title: t('Reports', { _tags: 'core' }),
					drawerLabel: t('Reports', { _tags: 'core' }),
					drawerIcon: ({ focused }) => (
						<Icon size="xl" name="chartMixedUpCircleDollar" className={focused && 'text-primary'} />
					),
				}}
			>
				{(props) =>
					isPro ? (
						<ErrorBoundary>
							<Suspense>
								<ReportsNavigator {...props} />
							</Suspense>
						</ErrorBoundary>
					) : (
						<PageUpgrade page="reports" />
					)
				}
			</Drawer.Screen>
			<Drawer.Screen
				name="LogsStack"
				options={{
					title: t('Logs', { _tags: 'core' }),
					drawerLabel: t('Logs', { _tags: 'core' }),
					drawerIcon: ({ focused }) => (
						<Icon size="xl" name="heartPulse" className={focused && 'text-primary'} />
					),
					drawerItemStyle: { marginTop: 'auto' },
				}}
			>
				{(props) => (
					<ErrorBoundary>
						<Suspense>
							<LogsWithProviders {...props} />
						</Suspense>
					</ErrorBoundary>
				)}
			</Drawer.Screen>
			<Drawer.Screen
				name="SupportStack"
				options={{
					title: t('Support', { _tags: 'core' }),
					drawerLabel: t('Support', { _tags: 'core' }),
					drawerIcon: ({ focused }) => (
						<Icon size="xl" name="commentQuestion" className={focused && 'text-primary'} />
					),
					// drawerItemStyle: { marginTop: 'auto' },
				}}
			>
				{(props) => (
					<ErrorBoundary>
						<Suspense>
							<Support {...props} />
						</Suspense>
					</ErrorBoundary>
				)}
			</Drawer.Screen>
		</Drawer.Navigator>
	);
};

/**
 *
 */
const TaxRatesScreen = () => {
	const query = useQuery({
		queryKeys: ['tax-rates'],
		collectionName: 'taxes',
		initialParams: {},
	});

	return (
		<ErrorBoundary>
			<Suspense>
				<TaxRates query={query} />
			</Suspense>
		</ErrorBoundary>
	);
};

/**
 *
 */
const MainNavigator = () => {
	const { site, storeDB, fastStoreDB } = useAppState();
	const wpAPIURL = useObservableEagerState(site.wp_api_url$);
	const { locale } = useLocale();
	const { wcposVersionPass } = useVersionCheck({ site });

	/**
	 * The http client should be smarter, ie: if offline or no auth, it should pause the replications
	 * or put this as part of the OnlineStatusProvider
	 */
	const http = useRestHttpClient();

	/**
	 * If the version is not supported, we should show an error message
	 */
	if (!wcposVersionPass) {
		return <UpgradeRequired />;
	}

	/**
	 * Sanity check: we should not proceed if we don't have a storeDB
	 */
	if (!isRxDatabase(storeDB)) {
		return null;
	}

	return (
		<ExtraDataProvider>
			<QueryProvider localDB={storeDB} fastLocalDB={fastStoreDB} http={http} locale={locale}>
				<UISettingsProvider>
					<OnlineStatusProvider wpAPIURL={wpAPIURL}>
						{/** NOTE - we need a portal provider inside main navigator, eg: to access useRestHttpClient  */}
						<Stack.Navigator screenOptions={{ headerShown: false }}>
							<Stack.Screen name="MainDrawer" component={DrawerNavigator} />
							<Stack.Group screenOptions={{ presentation: 'transparentModal' }}>
								<Stack.Screen name="Settings" component={SettingsTabs} />
								<Stack.Screen name="Login" component={Login} />
								<Stack.Screen name="TaxRates" component={TaxRatesScreen} />
							</Stack.Group>
						</Stack.Navigator>
					</OnlineStatusProvider>
				</UISettingsProvider>
				<Errors /> {/* TODO - we need a app-wide event bus to channel errors to the snackbar */}
				{/* <QueryDevtools /> */}
			</QueryProvider>
		</ExtraDataProvider>
	);
};

export default MainNavigator;
