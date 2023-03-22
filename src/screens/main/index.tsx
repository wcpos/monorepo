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
import Login from './login';
import OrdersNavigator from './orders';
import POSNavigator from './pos';
import ProductsNavigator from './products';
import Settings from './settings';
import Support from './support';
import useLocalData from '../../contexts/local-data';
import { t } from '../../lib/translations';
import { ModalLayout } from '../components/modal-layout';

export type MainStackParamList = {
	MainDrawer: undefined;
	Settings: undefined;
	Login: undefined;
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
const MainNavigator = () => {
	const { site } = useLocalData();
	if (!site) {
		/**
		 * FIXME - this is a hack to avoid the app crashing when site is null
		 * We need to find a better way to handle this
		 */
		throw new Promise((resolve, reject) => {
			resolve(true);
		});
	}
	const wpAPIURL = useObservableState(site.wp_api_url$, site.wp_api_url);
	const dimensions = useWindowDimensions();
	const theme = useTheme();
	const navigation = useNavigation();

	return (
		<UISettingsProvider>
			<OnlineStatusProvider wpAPIURL={wpAPIURL}>
				{/** NOTE - we need a portal provider inside main navigator, eg: to access useRestHttpClient  */}
				<Portal.Provider>
					<Stack.Navigator screenOptions={{ headerShown: false }}>
						<Stack.Screen name="MainDrawer">
							{() => (
								<Drawer.Navigator
									initialRouteName="POSStack"
									screenOptions={{
										header: (props) => <Header {...props} />,
										drawerType: dimensions.width >= theme.screens.medium ? 'permanent' : 'front',
										drawerStyle: {
											backgroundColor: theme.colors.headerBackground,
											width: dimensions.width >= theme.screens.medium ? 'auto' : undefined,
											borderRightColor: 'rgba(0, 0, 0, 0.2)',
											// borderRightWidth: 0,
										},
										sceneContainerStyle: { height: '100%' }, // important to set height to 100% to avoid scrolling
									}}
									drawerContent={(props) => <DrawerContent {...props} />}
								>
									<Drawer.Screen
										name="POSStack"
										component={POSNavigator}
										options={{
											title: t('POS', { _tags: 'core' }),
											drawerLabel: t('POS', { _tags: 'core' }),
											drawerIcon: ({ focused }) => (
												<Icon
													name="cashRegister"
													type={focused ? 'primary' : 'inverse'}
													size="large"
												/>
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
												<Icon name="lifeRing" type={focused ? 'primary' : 'inverse'} size="large" />
											),
											drawerItemStyle: { marginTop: 'auto' },
										}}
									/>
								</Drawer.Navigator>
							)}
						</Stack.Screen>
						<Stack.Group screenOptions={{ presentation: 'transparentModal' }}>
							<Stack.Screen name="Settings">
								{() => (
									<ModalLayout title={t('Settings', { _tags: 'core' })}>
										<Settings />
									</ModalLayout>
								)}
							</Stack.Screen>
							<Stack.Screen name="Login">
								{() => (
									<ModalLayout
										title={t('Login', { _tags: 'core' })}
										primaryAction={{ label: t('Login', { _tags: 'core' }) }}
										secondaryActions={[
											{ label: t('Cancel', { _tags: 'core' }), action: () => navigation.goBack() },
										]}
									>
										<Login />
									</ModalLayout>
								)}
							</Stack.Screen>
						</Stack.Group>
					</Stack.Navigator>
					<Portal.Manager />
				</Portal.Provider>
			</OnlineStatusProvider>
		</UISettingsProvider>
	);
};

export default MainNavigator;
