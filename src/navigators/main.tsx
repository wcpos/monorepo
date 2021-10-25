import * as React from 'react';
import { useNavigation, DrawerActions, RouteProp } from '@react-navigation/native';
import {
	createDrawerNavigator,
	DrawerNavigationOptions,
	DrawerNavigationProp,
} from '@react-navigation/drawer';
import POS from '@wcpos/common/src/screens/pos';
import Products from '@wcpos/common/src/screens/products';
import Orders from '@wcpos/common/src/screens/orders';
import Customers from '@wcpos/common/src/screens/customers';
import Support from '@wcpos/common/src/screens/support';
import Button from '@wcpos/common/src/components/button';
import HeaderRight from '@wcpos/common/src/screens/header/right';
import { UIResourceProvider } from '@wcpos/common/src/hooks/use-ui';

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
	// const navigation = useNavigation();

	const openDrawer = React.useCallback(() => {
		navigation.dispatch(DrawerActions.openDrawer());
	}, []);

	const screenOptions = React.useMemo<DrawerNavigationOptions>(
		() => ({
			headerStyle: {
				backgroundColor: '#f4511e',
				height: '40px',
			},
			headerTintColor: '#fff',
			headerTitleStyle: {
				fontWeight: 'bold',
				textAlign: 'center',
				margin: 0,
			},
			headerBackgroundContainerStyle: {},
			headerLeftContainerStyle: {
				padding: '5px',
				flexGrow: 1,
				flexShrink: 1,
				flexBasis: '20%',
			},
			headerRightContainerStyle: {
				padding: '5px',
				flexGrow: 1,
				flexShrink: 1,
				flexBasis: '20%',
			},
			headerTitleContainerStyle: {
				padding: '5px',
				flexGrow: 1,
				flexShrink: 1,
				flexBasis: '100%',
			},
			headerLeft: () => <Button onPress={openDrawer} title="Menu" />,
			headerRight: HeaderRight,
		}),
		[openDrawer]
	);

	return (
		<UIResourceProvider>
			<Drawer.Navigator screenOptions={screenOptions}>
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
