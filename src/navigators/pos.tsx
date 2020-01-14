import React from 'react';
import { createDrawerNavigator } from '@react-navigation/drawer';
import POS from '../sections/pos';
import Products from '../sections/products';
import Orders from '../sections/orders';
import Customers from '../sections/customers';
import Support from '../sections/support';

const Drawer = createDrawerNavigator();

export default function App({ navigation, route }) {
	return (
		<Drawer.Navigator initialRouteName="POS">
			<Drawer.Screen name="POS" component={POS} />
			<Drawer.Screen name="Products" component={Products} />
			<Drawer.Screen name="Orders" component={Orders} />
			<Drawer.Screen name="Customers" component={Customers} />
			<Drawer.Screen name="Support" component={Support} />
		</Drawer.Navigator>
	);
}
