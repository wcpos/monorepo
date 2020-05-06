import React from 'react';
import { createDrawerNavigator } from '@react-navigation/drawer';
import PageLayout from '../layout/page';
import POS from '../pages/pos';
import Products from '../pages/products';
// import Orders from '../sections/orders';
// import Customers from '../sections/customers';
import Support from '../pages/support';
// import MasterBar from '../sections/masterbar';

const Screen = ({ route }) => {
	const components = {
		POS: <POS />,
		Products: <Products />,
		Support: <Support />,
	};

	return <PageLayout header="test">{components[route.name]}</PageLayout>;
};

const Drawer = createDrawerNavigator();

const App: React.FC = () => {
	return (
		<Drawer.Navigator initialRouteName="POS">
			<Drawer.Screen name="POS" component={Screen} />
			<Drawer.Screen name="Products" component={Screen} />
			<Drawer.Screen name="Support" component={Screen} />
		</Drawer.Navigator>
	);
};

export default App;
