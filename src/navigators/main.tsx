import * as React from 'react';
import {
	createDrawerNavigator,
	DrawerNavigationProp,
	DrawerScreenProps,
} from '@react-navigation/drawer';
import { useTranslation } from 'react-i18next';
import { useObservableState } from 'observable-hooks';
import POS from '@wcpos/core/src/screens/pos';
import Products from '@wcpos/core/src/screens/products';
import Orders from '@wcpos/core/src/screens/orders';
import Customers from '@wcpos/core/src/screens/customers';
import Support from '@wcpos/core/src/screens/support';
import CustomHeader from '@wcpos/core/src/screens/header';
import CustomDrawer from '@wcpos/core/src/screens/drawer';
import { useWindowDimensions } from 'react-native';
import ErrorBoundary from '@wcpos/components/src/error-boundary';
import Icon, { IconName } from '@wcpos/components/src/icon';
import Text from '@wcpos/components/src/text';
import Box from '@wcpos/components/src/box';
import useAppState from '@wcpos/hooks/src/use-app-state';
import { OnlineStatusProvider } from '@wcpos/hooks/src/use-online-status';
import { useTheme } from 'styled-components/native';

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
			<React.Suspense fallback={<Text>Loading {props.route.name}</Text>}>
				<Box padding="small" style={{ height: '100%' }}>
					{screen}
				</Box>
			</React.Suspense>
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

/**
 *
 */
const MainNavigator = () => {
	const { store } = useAppState();
	const { t } = useTranslation();
	const dimensions = useWindowDimensions();
	const theme = useTheme();
	const storeName = useObservableState(store.name$, store.name);

	const header = React.useCallback((props) => <CustomHeader {...props} />, []);
	const drawer = React.useCallback((props) => <CustomDrawer {...props} />, []);

	const getOptions = React.useCallback(
		(key: Extract<keyof typeof iconMap, string>) => {
			const renderIcon = ({ focused }: { focused: boolean }) => (
				<Icon name={iconMap[key] as IconName} type={focused ? 'primary' : 'inverse'} size="large" />
			);

			return {
				title: `${t(`${key}.title`)} - ${storeName}`,
				drawerLabel: t(`${key}.title`),
				drawerIcon: renderIcon,
			};
		},
		[storeName, t]
	);

	return (
		<OnlineStatusProvider>
			<Drawer.Navigator
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
				<Drawer.Screen name="POS" component={ScreenMemoized} options={getOptions('pos')} />
				<Drawer.Screen
					name="Products"
					component={ScreenMemoized}
					options={getOptions('products')}
				/>
				<Drawer.Screen name="Orders" component={ScreenMemoized} options={getOptions('orders')} />
				<Drawer.Screen
					name="Customers"
					component={ScreenMemoized}
					options={getOptions('customers')}
				/>
				<Drawer.Screen name="Support" component={ScreenMemoized} options={getOptions('support')} />
			</Drawer.Navigator>
		</OnlineStatusProvider>
	);
};

export default MainNavigator;
