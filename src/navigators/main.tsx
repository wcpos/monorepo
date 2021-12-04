import * as React from 'react';
import {
	createDrawerNavigator,
	DrawerNavigationProp,
	DrawerScreenProps,
} from '@react-navigation/drawer';
import { useTranslation } from 'react-i18next';
import POS from '@wcpos/common/src/screens/pos';
import Products from '@wcpos/common/src/screens/products';
import Orders from '@wcpos/common/src/screens/orders';
import Customers from '@wcpos/common/src/screens/customers';
import Support from '@wcpos/common/src/screens/support';
import CustomHeader from '@wcpos/common/src/screens/header';
import CustomDrawer from '@wcpos/common/src/screens/drawer';
import { useWindowDimensions } from 'react-native';
import ErrorBoundary from '@wcpos/common/src/components/error-boundary';
import Icon, { IconName } from '@wcpos/common/src/components/icon';
import Text from '@wcpos/common/src/components/text';
import useAppState from '@wcpos/common/src/hooks/use-app-state';
import curry from 'lodash/curry';

export type DrawerParamList = {
	POS: undefined;
	Products: undefined;
	Orders: undefined;
	Customers: undefined;
	Support: undefined;
};

const Drawer = createDrawerNavigator<DrawerParamList>();

/**
 * Use memoized Screen Component to apply layout and errorboundary
 * https://reactnavigation.org/docs/screen/#children
 */
const Screen = (props: DrawerScreenProps<DrawerParamList>) => {
	const screen = React.useMemo(() => {
		switch (props.route.name) {
			case 'POS':
				return <POS />;
			case 'Products':
				return <Products />;
			case 'Orders':
				return <Orders />;
			case 'Customers':
				return <Customers />;
			case 'Support':
				return <Support />;
			default:
				return null;
		}
	}, [props]);

	return (
		<ErrorBoundary>
			<React.Suspense fallback={<Text>Loading {props.route.name}</Text>}>{screen}</React.Suspense>
		</ErrorBoundary>
	);
};

const ScreenMemoized = React.memo(Screen);

// Map icons to screens
const iconMap = {
	pos: 'cashRegister',
	products: 'gifts',
	orders: 'receipt',
	customers: 'users',
	support: 'lifeRing',
};

const drawerIcon = curry(
	(
		key: Extract<keyof typeof iconMap, string>,
		props: {
			focused: boolean;
		}
	) => {
		return (
			<Icon
				name={iconMap[key] as IconName}
				type={props.focused ? 'primary' : 'inverse'}
				size="large"
				{...props}
			/>
		);
	}
);

/**
 *
 */
const MainNavigator = () => {
	const { store } = useAppState();
	const { t } = useTranslation();
	const dimensions = useWindowDimensions();

	const header = React.useCallback((props) => <CustomHeader {...props} />, []);
	const drawer = React.useCallback((props) => <CustomDrawer {...props} />, []);

	const getOptions = React.useCallback(
		(key) => ({
			title: `${t(`${key}.title`)} - ${store.name}`,
			drawerLabel: t(`${key}.title`),
			drawerIcon: drawerIcon(key),
		}),
		[store.name, t]
	);

	return (
		<Drawer.Navigator
			screenOptions={{
				header,
				drawerType: dimensions.width >= 1024 ? 'permanent' : 'front',
				drawerStyle: {
					backgroundColor: '#2c3e50',
					width: dimensions.width >= 1024 ? 'auto' : undefined,
				},
			}}
			drawerContent={drawer}
		>
			<Drawer.Screen name="POS" component={ScreenMemoized} options={getOptions('pos')} />
			<Drawer.Screen name="Products" component={ScreenMemoized} options={getOptions('products')} />
			<Drawer.Screen name="Orders" component={ScreenMemoized} options={getOptions('orders')} />
			<Drawer.Screen
				name="Customers"
				component={ScreenMemoized}
				options={getOptions('customers')}
			/>
			<Drawer.Screen name="Support" component={ScreenMemoized} options={getOptions('support')} />
		</Drawer.Navigator>
	);
};

export default MainNavigator;
