import * as React from 'react';
import { useWindowDimensions } from 'react-native';

import { createDrawerNavigator } from '@react-navigation/drawer';
import { createStackNavigator } from '@react-navigation/stack';
import { useForceUpdate, useObservableEagerState, useSubscription } from 'observable-hooks';
import { isRxDatabase } from 'rxdb';
import { useTheme } from 'styled-components/native';

import Icon from '@wcpos/components/src/icon';
import Portal from '@wcpos/components/src/portal';
import { OnlineStatusProvider } from '@wcpos/hooks/src/use-online-status';
import { QueryProvider, QueryDevtools } from '@wcpos/query';
import logger from '@wcpos/utils/src/logger';

import DrawerContent from './components/drawer-content';
import Header from './components/header';
import { ExtraDataProvider } from './contexts/extra-data';
import { UISettingsProvider } from './contexts/ui-settings';
import CustomersNavigator from './customers';
import { ErrorSnackbar } from './errors';
import Help from './help';
import useKeyboardShortcuts from './hooks/use-keyboard-shortcuts';
import { useRestHttpClient } from './hooks/use-rest-http-client';
import Login from './login';
import { LogsWithProviders } from './logs';
import OrdersNavigator from './orders';
import POSNavigator from './pos';
import ProductsNavigator from './products';
import ReportsNavigator from './reports';
import Settings from './settings';
import Support from './support';
import TaxRates from './tax-rates';
import { UpgradeRequired } from './upgrade-required';
import { useAppState } from '../../contexts/app-state';
import { useT } from '../../contexts/translations';
import { useLocale } from '../../hooks/use-locale';
import { useVersionCheck } from '../../hooks/use-version-check';
import { ModalLayout } from '../components/modal-layout';

export type MainStackParamList = {
	MainDrawer: undefined;
	Settings: undefined;
	Help: undefined;
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
	const theme = useTheme();
	useKeyboardShortcuts(); // allows navigation by hotkeys
	const t = useT();
	const { site } = useAppState();
	const license = useObservableEagerState(site.license$);
	const [showUpgrade, setShowUpgrade] = React.useState(!license?.key);

	const largeScreen = dimensions.width >= theme.screens.medium;

	return (
		<Drawer.Navigator
			initialRouteName="POSStack"
			screenOptions={{
				header: (props) => (
					<Header {...props} showUpgrade={showUpgrade} setShowUpgrade={setShowUpgrade} />
				),
				drawerType: largeScreen ? 'permanent' : 'front',
				drawerStyle: {
					backgroundColor: theme.colors.headerBackground,
					width: largeScreen ? 'auto' : undefined,
					borderRightColor: 'rgba(0, 0, 0, 0.2)',
					// borderRightWidth: 0,
				},
				sceneContainerStyle: { height: '100%' }, // important to set height to 100% to avoid scrolling
			}}
			drawerContent={(props) => <DrawerContent {...props} largeScreen={largeScreen} />}
		>
			<Drawer.Screen
				name="POSStack"
				component={POSNavigator}
				options={{
					title: t('POS', { _tags: 'core' }),
					drawerLabel: t('POS', { _tags: 'core' }),
					drawerIcon: ({ focused }) => (
						<Icon name="cashRegister" type={focused ? 'primary' : 'inverse'} size="large" />
					),
				}}
			/>
			<Drawer.Screen
				name="ProductsStack"
				component={ProductsNavigator}
				options={{
					title: t('Products', { _tags: 'core' }),
					drawerLabel: t('Products', { _tags: 'core' }),
					drawerIcon: ({ focused }) => (
						<Icon name="gifts" type={focused ? 'primary' : 'inverse'} size="large" />
					),
				}}
			/>
			<Drawer.Screen
				name="OrdersStack"
				component={OrdersNavigator}
				options={{
					title: t('Orders', { _tags: 'core' }),
					drawerLabel: t('Orders', { _tags: 'core' }),
					drawerIcon: ({ focused }) => (
						<Icon name="receipt" type={focused ? 'primary' : 'inverse'} size="large" />
					),
				}}
			/>
			<Drawer.Screen
				name="CustomersStack"
				component={CustomersNavigator}
				options={{
					title: t('Customers', { _tags: 'core' }),
					drawerLabel: t('Customers', { _tags: 'core' }),
					drawerIcon: ({ focused }) => (
						<Icon name="users" type={focused ? 'primary' : 'inverse'} size="large" />
					),
				}}
			/>
			<Drawer.Screen
				name="ReportsStack"
				component={ReportsNavigator}
				options={{
					title: t('Reports', { _tags: 'core' }),
					drawerLabel: t('Reports', { _tags: 'core' }),
					drawerIcon: ({ focused }) => (
						<Icon
							name="chartMixedUpCircleDollar"
							type={focused ? 'primary' : 'inverse'}
							size="large"
						/>
					),
				}}
			/>
			<Drawer.Screen
				name="LogsStack"
				component={LogsWithProviders}
				options={{
					title: t('Logs', { _tags: 'core' }),
					drawerLabel: t('Logs', { _tags: 'core' }),
					drawerIcon: ({ focused }) => (
						<Icon name="heartPulse" type={focused ? 'primary' : 'inverse'} size="large" />
					),
					drawerItemStyle: { marginTop: 'auto' },
				}}
			/>
			<Drawer.Screen
				name="SupportStack"
				component={Support}
				options={{
					title: t('Support', { _tags: 'core' }),
					drawerLabel: t('Support', { _tags: 'core' }),
					drawerIcon: ({ focused }) => (
						<Icon name="commentQuestion" type={focused ? 'primary' : 'inverse'} size="large" />
					),
					// drawerItemStyle: { marginTop: 'auto' },
				}}
			/>
		</Drawer.Navigator>
	);
};

/**
 *
 */
const SettingsScreen = () => {
	const t = useT();

	return (
		<ModalLayout title={t('Settings', { _tags: 'core' })}>
			<Settings />
		</ModalLayout>
	);
};

/**
 *
 */
const HelpScreen = () => {
	const t = useT();

	return (
		<ModalLayout title={t('Help', { _tags: 'core' })}>
			<Help />
		</ModalLayout>
	);
};

/**
 *
 */
const LoginScreen = () => {
	const { site, wpCredentials } = useAppState();
	const t = useT();
	// TODO - need to add a login url to the site object

	return (
		<ModalLayout
			title={t('Login', { _tags: 'core' })}
			// primaryAction={{ label: t('Login', { _tags: 'core' }) }}
			// secondaryActions={[
			// 	{ label: t('Cancel', { _tags: 'core' }), action: () => navigation.goBack() },
			// ]}
		>
			<Login loginUrl={`${site.home}/wcpos-login`} wpCredentials={wpCredentials} />
		</ModalLayout>
	);
};

/**
 *
 */
const TaxRatesScreen = () => {
	const t = useT();

	return (
		<ModalLayout title={t('Tax Rates', { _tags: 'core' })} size="xxLarge">
			<TaxRates />
		</ModalLayout>
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
						<Portal.Provider>
							<Stack.Navigator screenOptions={{ headerShown: false }}>
								<Stack.Screen name="MainDrawer" component={DrawerNavigator} />
								<Stack.Group screenOptions={{ presentation: 'transparentModal' }}>
									<Stack.Screen name="Settings" component={SettingsScreen} />
									<Stack.Screen name="Help" component={HelpScreen} />
									<Stack.Screen name="Login" component={LoginScreen} />
									<Stack.Screen name="TaxRates" component={TaxRatesScreen} />
								</Stack.Group>
							</Stack.Navigator>
							<Portal.Manager />
						</Portal.Provider>
					</OnlineStatusProvider>
				</UISettingsProvider>
				<ErrorSnackbar />
				{/* <QueryDevtools /> */}
			</QueryProvider>
		</ExtraDataProvider>
	);
};

export default MainNavigator;
