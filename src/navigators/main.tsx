import * as React from 'react';
import { createDrawerNavigator } from '@react-navigation/drawer';
import PageLayout from '../layout/page';
import MasterBar from '../layout/masterbar';
import ErrorBoundary from '../components/error';
import POS from '../pages/pos';
import Products from '../pages/products';
import Orders from '../pages/orders';
import Customers from '../pages/customers';
import Support from '../pages/support';
import Text from '../components/text';

type ScreenProps = {
	route: {
		name: Extract<keyof typeof components, string>;
	};
};

const components = {
	POS: <POS />,
	Products: <Products />,
	Orders: <Orders />,
	Customers: <Customers />,
	Support: <Support />,
};

const Screen = ({ route }: ScreenProps) => {
	return (
		<PageLayout header={<MasterBar />}>
			<ErrorBoundary>
				<React.Suspense fallback={<Text>{`Loading ${route.name} page...`}</Text>}>
					{components[route.name]}
				</React.Suspense>
			</ErrorBoundary>
		</PageLayout>
	);
};

const Drawer = createDrawerNavigator();

const MainNavigator = () => {
	return (
		<Drawer.Navigator>
			<Drawer.Screen name="POS" component={Screen} />
			<Drawer.Screen name="Products" component={Screen} />
			<Drawer.Screen name="Orders" component={Screen} />
			<Drawer.Screen name="Customers" component={Screen} />
			<Drawer.Screen name="Support" component={Screen} />
		</Drawer.Navigator>
	);
};

export default MainNavigator;
