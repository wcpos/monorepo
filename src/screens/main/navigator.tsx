import * as React from 'react';
import { createDrawerNavigator } from '@react-navigation/drawer';
import { useObservableState, useObservableSuspense } from 'observable-hooks';
import { useWindowDimensions } from 'react-native';
import Icon, { IconName } from '@wcpos/components/src/icon';
import { StoreProvider } from '@wcpos/hooks/src/use-store';
import useAuth from '@wcpos/hooks/src/use-auth';
import { OnlineStatusProvider } from '@wcpos/hooks/src/use-online-status';
import { useTheme } from 'styled-components/native';
// import Support from './support';
import { t } from '@wcpos/core/src/lib/translations';
import Customers from './customers';
import Orders from './orders';
import Products from './products';
import POS from './pos';
import CustomDrawer from './drawer';
import CustomHeader from './header';

export type DrawerParamList = {
	POS: undefined;
	Products: undefined;
	Orders: undefined;
	Customers: undefined;
	Support: undefined;
};

const Drawer = createDrawerNavigator<DrawerParamList>();

/**
 *
 */
export const MainNavigator = () => {
	const { store, storeDBResource } = useAuth();
	if (!storeDBResource) {
		/**
		 * @TODO - this is a temporary workaround to prevent the app from crashing
		 * How to unmount MainNavigator when storeDBResource is not available?
		 */
		throw new Promise(() => {});
	}
	const storeDB = useObservableSuspense(storeDBResource);
	const storeName = useObservableState(store.name$, store.name);
	const dimensions = useWindowDimensions();
	const theme = useTheme();
	const header = React.useCallback((props) => <CustomHeader {...props} />, []);
	const drawer = React.useCallback((props) => <CustomDrawer {...props} />, []);

	/**
	 * Render the drawer icon
	 */
	const renderIcon = React.useCallback(
		({ icon, focused }: { icon: IconName; focused: boolean }) => (
			<Icon name={icon} type={focused ? 'primary' : 'inverse'} size="large" />
		),
		[]
	);

	/**
	 *
	 */
	return (
		<OnlineStatusProvider>
			<StoreProvider store={store} storeDB={storeDB}>
				<Drawer.Navigator
					initialRouteName="POS"
					screenOptions={{
						header,
						drawerType: dimensions.width >= theme.screens.medium ? 'permanent' : 'front',
						drawerStyle: {
							backgroundColor: theme.colors.headerBackground,
							width: dimensions.width >= theme.screens.medium ? 'auto' : undefined,
							borderRightColor: 'rgba(0, 0, 0, 0.2)',
							// borderRightWidth: 0,
						},
						sceneContainerStyle: { height: '100%' }, // important to set height to 100% to avoid scrolling
					}}
					drawerContent={drawer}
				>
					<Drawer.Screen
						name="POS"
						component={POS}
						options={{
							title: `${t('POS')} - ${storeName}`,
							drawerLabel: t('POS'),
							drawerIcon: ({ focused }) => renderIcon({ icon: 'cashRegister', focused }),
						}}
					/>
					<Drawer.Screen
						name="Products"
						component={Products}
						options={{
							title: `${t('Products')} - ${storeName}`,
							drawerLabel: t('Products'),
							drawerIcon: ({ focused }) => renderIcon({ icon: 'gifts', focused }),
						}}
					/>
					<Drawer.Screen
						name="Orders"
						component={Orders}
						options={{
							title: `${t('Orders')} - ${storeName}`,
							drawerLabel: t('Orders'),
							drawerIcon: ({ focused }) => renderIcon({ icon: 'receipt', focused }),
						}}
					/>
					<Drawer.Screen
						name="Customers"
						component={Customers}
						options={{
							title: `${t('Customers')} - ${storeName}`,
							drawerLabel: t('Customers'),
							drawerIcon: ({ focused }) => renderIcon({ icon: 'users', focused }),
						}}
					/>
					{/* <Drawer.Screen name="Support" component={Support} options={getOptions('support')} /> */}
				</Drawer.Navigator>
			</StoreProvider>
		</OnlineStatusProvider>
	);
};
