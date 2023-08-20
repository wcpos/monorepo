import * as React from 'react';
import { useWindowDimensions } from 'react-native';

import { createDrawerNavigator } from '@react-navigation/drawer';
import { useNavigation } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { useObservableState } from 'observable-hooks';
import { useTheme } from 'styled-components/native';

import Icon from '@wcpos/components/src/icon';
import Portal from '@wcpos/components/src/portal';
import { OnlineStatusProvider } from '@wcpos/hooks/src/use-online-status';

import DrawerContent from './components/drawer-content';
import Header from './components/header';
import { UISettingsProvider } from './contexts/ui-settings';
import CustomersNavigator from './customers';
import Help from './help';
import useKeyboardShortcuts from './hooks/use-keyboard-shortcuts';
import Login from './login';
import OrdersNavigator from './orders';
import POSNavigator from './pos';
import ProductsNavigator from './products';
import Settings from './settings';
import Support from './support';
import TaxRates from './tax-rates';
import { useAppState } from '../../contexts/app-state';
import { t } from '../../lib/translations';
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

	const largeScreen = dimensions.width >= theme.screens.medium;

	return (
		<Drawer.Navigator
			initialRouteName="POSStack"
			screenOptions={{
				header: (props) => <Header {...props} />,
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
				name="SupportStack"
				component={Support}
				options={{
					title: t('Support', { _tags: 'core' }),
					drawerLabel: t('Support', { _tags: 'core' }),
					drawerIcon: ({ focused }) => (
						<Icon name="commentQuestion" type={focused ? 'primary' : 'inverse'} size="large" />
					),
					drawerItemStyle: { marginTop: 'auto' },
				}}
			/>
		</Drawer.Navigator>
	);
};

/**
 *
 */
const SettingsScreen = () => {
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
	const { site } = useAppState();
	const wpAPIURL = useObservableState(site.wp_api_url$, site.wp_api_url);

	return (
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
	);
};

export default MainNavigator;
