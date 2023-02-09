import * as React from 'react';
import { useWindowDimensions } from 'react-native';

import { createDrawerNavigator } from '@react-navigation/drawer';
import { createStackNavigator } from '@react-navigation/stack';
import { useObservableState } from 'observable-hooks';
import { useTheme } from 'styled-components/native';

import Icon from '@wcpos/components/src/icon';
import { OnlineStatusProvider } from '@wcpos/hooks/src/use-online-status';

import DrawerContent from './components/drawer-content';
import Header from './components/header';
import { UIProvider } from './contexts/ui';
import CustomersNavigator from './customers';
import Login from './login';
import OrdersNavigator from './orders';
import POSNavigator from './pos';
import ProductsNavigator from './products';
import Settings from './settings';
import useAuth from '../../contexts/auth';
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
};

const Drawer = createDrawerNavigator<DrawerParamList>();

/**
 *
 */
const MainNavigator = () => {
	const { site } = useAuth();
	const wpAPIURL = useObservableState(site.wp_api_url$, site.wp_api_url);
	const dimensions = useWindowDimensions();
	const theme = useTheme();

	return (
		<OnlineStatusProvider wpAPIURL={wpAPIURL}>
			<Stack.Navigator screenOptions={{ headerShown: false }}>
				<Stack.Screen name="MainDrawer">
					{() => (
						<UIProvider>
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
							</Drawer.Navigator>
						</UIProvider>
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
							<ModalLayout title={t('Login', { _tags: 'core' })}>
								<Login />
							</ModalLayout>
						)}
					</Stack.Screen>
				</Stack.Group>
			</Stack.Navigator>
		</OnlineStatusProvider>
	);
};

export default MainNavigator;
