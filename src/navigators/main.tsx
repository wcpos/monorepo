import * as React from 'react';
import {
	createDrawerNavigator,
	DrawerNavigationProp,
	DrawerScreenProps,
} from '@react-navigation/drawer';
import POS from '@wcpos/common/src/screens/pos';
import Products from '@wcpos/common/src/screens/products';
import Orders from '@wcpos/common/src/screens/orders';
import Customers from '@wcpos/common/src/screens/customers';
import Support from '@wcpos/common/src/screens/support';
import CustomHeader from '@wcpos/common/src/screens/header';
import CustomDrawer from '@wcpos/common/src/screens/drawer';
import { useWindowDimensions, Text } from 'react-native';
import ErrorBoundary from '@wcpos/common/src/components/error-boundary';

export type DrawerParamList = {
	POS: undefined;
	Products: undefined;
	Orders: undefined;
	Customers: undefined;
	Support: undefined;
};

const Drawer = createDrawerNavigator<DrawerParamList>();

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

/**
 * @TODO - use children to render the screens to apply layout and errorboundary?
 * https://reactnavigation.org/docs/screen/#children
 */
const MainNavigator = () => {
	const dimensions = useWindowDimensions();

	const header = React.useCallback((props) => <CustomHeader {...props} />, []);
	const drawer = React.useCallback((props) => <CustomDrawer {...props} />, []);

	return (
		<Drawer.Navigator
			screenOptions={{
				header,
				drawerType: dimensions.width >= 1024 ? 'permanent' : 'front',
				drawerStyle: {
					backgroundColor: '#2c3e50',
					width: dimensions.width >= 1024 ? 80 : undefined,
				},
			}}
			drawerContent={drawer}
		>
			<Drawer.Screen name="POS" component={ScreenMemoized} />
			<Drawer.Screen name="Products" component={ScreenMemoized} />
			<Drawer.Screen name="Orders" component={ScreenMemoized} />
			<Drawer.Screen name="Customers" component={ScreenMemoized} />
			<Drawer.Screen name="Support" component={ScreenMemoized} />
		</Drawer.Navigator>
	);
};

export default MainNavigator;
