import * as React from 'react';
import { RouteProp } from '@react-navigation/native';
import { createDrawerNavigator, DrawerNavigationProp } from '@react-navigation/drawer';
import POS from '@wcpos/common/src/screens/pos';
import Products from '@wcpos/common/src/screens/products';
import Orders from '@wcpos/common/src/screens/orders';
import Customers from '@wcpos/common/src/screens/customers';
import Support from '@wcpos/common/src/screens/support';
import CustomHeader from '@wcpos/common/src/screens/header';
import CustomDrawer from '@wcpos/common/src/screens/drawer';
import { UIResourceProvider } from '@wcpos/common/src/hooks/use-ui';
import { useWindowDimensions } from 'react-native';

type MainScreenProps = import('./app').MainScreenProps;

export type DrawerParamList = {
	POS: undefined;
	Products: undefined;
	Orders: undefined;
	Customers: undefined;
	Support: undefined;
};

export interface POSScreenProps {
	navigation: DrawerNavigationProp<DrawerParamList, 'POS'>;
	route: RouteProp<DrawerParamList, 'POS'>;
}

export interface ProductsScreenProps {
	navigation: DrawerNavigationProp<DrawerParamList, 'Products'>;
	route: RouteProp<DrawerParamList, 'Products'>;
}

export interface OrdersScreenProps {
	navigation: DrawerNavigationProp<DrawerParamList, 'Orders'>;
	route: RouteProp<DrawerParamList, 'Orders'>;
}

export interface CustomersScreenProps {
	navigation: DrawerNavigationProp<DrawerParamList, 'Customers'>;
	route: RouteProp<DrawerParamList, 'Customers'>;
}

export interface SupportScreenProps {
	navigation: DrawerNavigationProp<DrawerParamList, 'Support'>;
	route: RouteProp<DrawerParamList, 'Support'>;
}

const Drawer = createDrawerNavigator<DrawerParamList>();

/**
 *
 */
const MainNavigator = ({ navigation, route }: MainScreenProps) => {
	const dimensions = useWindowDimensions();

	const header = React.useCallback((props) => <CustomHeader {...props} />, []);
	const drawer = React.useCallback((props) => <CustomDrawer {...props} />, []);

	return (
		<UIResourceProvider>
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
				<Drawer.Screen name="POS" component={POS} />
				<Drawer.Screen name="Products" component={Products} />
				<Drawer.Screen name="Orders" component={Orders} />
				<Drawer.Screen name="Customers" component={Customers} />
				<Drawer.Screen name="Support" component={Support} />
			</Drawer.Navigator>
		</UIResourceProvider>
	);
};

export default MainNavigator;
