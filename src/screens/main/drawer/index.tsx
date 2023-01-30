import * as React from 'react';
import { useWindowDimensions } from 'react-native';

import { createDrawerNavigator } from '@react-navigation/drawer';
import { useTheme } from 'styled-components/native';

import Icon from '@wcpos/components/src/icon';

import DrawerContent from './components/drawer-content';
import Header from './components/header';
import CustomersNavigator from './customers/_navigator';
import OrdersNavigator from './orders/_navigator';
import POSNavigator from './pos';
import ProductsNavigator from './products';
import { UIProvider } from '../../../contexts/ui';
import { t } from '../../../lib/translations';

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
const DrawerNavigator = () => {
	const dimensions = useWindowDimensions();
	const theme = useTheme();

	/**
	 *
	 */
	return (
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
						// title: 'POS',
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
						title: 'gsdgd',
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
						title: 'Customers',
						drawerLabel: t('Customers', { _tags: 'core' }),
						drawerIcon: ({ focused }) => (
							<Icon name="users" type={focused ? 'primary' : 'inverse'} size="large" />
						),
					}}
				/>
			</Drawer.Navigator>
		</UIProvider>
	);
};

export default DrawerNavigator;
