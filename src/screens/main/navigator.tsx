import * as React from 'react';
import { useWindowDimensions } from 'react-native';

import { createDrawerNavigator } from '@react-navigation/drawer';
import { useObservableState } from 'observable-hooks';
import { useTheme } from 'styled-components/native';

import Icon, { IconName } from '@wcpos/components/src/icon';
import { OnlineStatusProvider } from '@wcpos/hooks/src/use-online-status';
import log from '@wcpos/utils/src/logger';

import Customers from './customers';
import CustomDrawer from './drawer';
import CustomHeader from './header';
import OrdersNavigator from './orders';
import POS from './pos';
import Products from './products';
import useAuth from '../../contexts/auth';
import { UIProvider } from '../../contexts/ui';
import { t } from '../../lib/translations';

export type DrawerParamList = {
	POS: undefined;
	Products: undefined;
	Orders: undefined;
	Customers: undefined;
	Support: undefined;
};

const Drawer = createDrawerNavigator<DrawerParamList>();

const iconMap = {
	POS: 'cashRegister',
	Products: 'gifts',
	Orders: 'receipt',
	Customers: 'users',
} as Record<string, IconName>;

/**
 *
 */
export const MainNavigator = () => {
	const { store, site } = useAuth();
	if (!store) {
		/**
		 * @TODO - this is a temporary workaround to prevent the app from crashing
		 * How to unmount MainNavigator when storeDB is not available?
		 */
		throw new Promise(() => {});
	}
	const storeName = useObservableState(store.name$, store.name);
	const wpAPIURL = useObservableState(site.wp_api_url$, site.wp_api_url);
	const dimensions = useWindowDimensions();
	const theme = useTheme();
	const header = React.useCallback((props) => <CustomHeader {...props} />, []);
	const drawer = React.useCallback((props) => <CustomDrawer {...props} />, []);
	log.debug('render MainNavigator');

	/**
	 * screenOptions change depending on the screen size
	 *
	 * @TODO - screen size changes is janky on electron, seems okay on web though
	 */
	const screenOptions = React.useMemo(() => {
		return {
			header,
			drawerType: dimensions.width >= theme.screens.medium ? 'permanent' : 'front',
			drawerStyle: {
				backgroundColor: theme.colors.headerBackground,
				width: dimensions.width >= theme.screens.medium ? 'auto' : undefined,
				borderRightColor: 'rgba(0, 0, 0, 0.2)',
				// borderRightWidth: 0,
			},
			sceneContainerStyle: { height: '100%' }, // important to set height to 100% to avoid scrolling
		};
	}, [dimensions.width, header, theme.colors.headerBackground, theme.screens.medium]);

	/**
	 * Drawer Screen options are memoized to avoid re-rendering
	 */
	const options = React.useCallback(
		({ route }) => {
			return {
				/**
				 * Translations strings for @transifex/cli
				 * t('POS', { _tags: 'core' })
				 * t('Products', { _tags: 'core' })
				 * t('Orders', { _tags: 'core' })
				 * t('Customers', { _tags: 'core' })
				 * t('Coupons', { _tags: 'core' })
				 * t('Reports', { _tags: 'core' })
				 * t('Support', { _tags: 'core' })
				 */
				title: `${t(route.name)} - ${storeName}`,
				drawerLabel: t(route.name),
				drawerIcon: ({ focused }) => (
					<Icon name={iconMap[route.name]} type={focused ? 'primary' : 'inverse'} size="large" />
				),
			};
		},
		[storeName]
	);

	/**
	 *
	 */
	return (
		<OnlineStatusProvider wpAPIURL={wpAPIURL}>
			<UIProvider>
				<Drawer.Navigator
					initialRouteName="POS"
					screenOptions={screenOptions}
					drawerContent={drawer}
				>
					<Drawer.Screen name="POS" component={POS} options={options} />
					<Drawer.Screen name="Products" component={Products} options={options} />
					<Drawer.Screen name="Orders" component={OrdersNavigator} options={options} />
					<Drawer.Screen name="Customers" component={Customers} options={options} />
				</Drawer.Navigator>
			</UIProvider>
		</OnlineStatusProvider>
	);
};
