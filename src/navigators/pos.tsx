import React from 'react';
import { View } from 'react-native';
import { createDrawerNavigator } from '@react-navigation/drawer';
import POS from '../sections/pos';
import Products from '../sections/products';
import Orders from '../sections/orders';
import Customers from '../sections/customers';
import Support from '../sections/support';
import MasterBar from '../sections/masterbar';

const Screen = ({ children }) => {
	return (
		<View>
			<MasterBar />
			<POS />
		</View>
	);
};

const Drawer = createDrawerNavigator();

const App: React.FC = () => {
	return (
		<Drawer.Navigator initialRouteName="Cart">
			<Drawer.Screen name="Cart" component={Screen} />
			<Drawer.Screen name="Products" component={Products} />
			<Drawer.Screen name="Orders" component={Orders} />
			<Drawer.Screen name="Customers" component={Customers} />
			<Drawer.Screen name="Support" component={Support} />
		</Drawer.Navigator>
	);
};

export default App;
