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
import Box from '@wcpos/common/src/components/box';
import useAppState from '@wcpos/common/src/hooks/use-app-state';
import useStoreSync from '@wcpos/common/src/hooks/use-store-sync';
import useIdAudit from '@wcpos/common/src/hooks/use-id-audit';
import { OnlineStatusProvider } from '@wcpos/common/src/hooks/use-online-status';
import { useTheme } from 'styled-components/native';
import { ResourceProvider } from '@wcpos/common/src/hooks/use-resource';

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
	useIdAudit();
	// useStoreSync();

	const header = React.useCallback((props) => <CustomHeader {...props} />, []);
	const drawer = React.useCallback((props) => <CustomDrawer {...props} />, []);

	const getOptions = React.useCallback(
		(key: Extract<keyof typeof iconMap, string>) => {
			const renderIcon = ({ focused }: { focused: boolean }) => (
				<Icon name={iconMap[key] as IconName} type={focused ? 'primary' : 'inverse'} size="large" />
			);

			return {
				title: `${t(`${key}.title`)} - ${store.name}`,
				drawerLabel: t(`${key}.title`),
				drawerIcon: renderIcon,
			};
		},
		[store.name, t]
	);

	return (
		<ResourceProvider>
			<OnlineStatusProvider>
				<Drawer.Navigator
					screenOptions={{
						header,
						drawerType: dimensions.width >= theme.screens.medium ? 'permanent' : 'front',
						drawerStyle: {
							backgroundColor: '#2c3e50',
							width: dimensions.width >= theme.screens.medium ? 'auto' : undefined,
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
					<Drawer.Screen
						name="Support"
						component={ScreenMemoized}
						options={getOptions('support')}
					/>
				</Drawer.Navigator>
			</OnlineStatusProvider>
		</ResourceProvider>
	);
};

export default MainNavigator;
