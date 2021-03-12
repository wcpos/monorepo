import * as React from 'react';
import { createDrawerNavigator } from '@react-navigation/drawer';
import PageLayout from '@wcpos/common/src/layout/page';
import MasterBar from '@wcpos/common/src/layout/masterbar';
import ErrorBoundary from '@wcpos/common/src/components/error';
import POS from '@wcpos/common/src/screens/pos';
import Products from '@wcpos/common/src/screens/products';
// import Orders from '../screens/orders';
// import Customers from '../screens/customers';
// import Support from '../screens/support';
import Text from '@wcpos/common/src/components/text';

type ScreenProps = {
	route: {
		name: Extract<keyof typeof components, string>;
	};
};

const components = {
	POS: <POS />,
	Products: <Products />,
	// Orders: <Orders />,
	// Customers: <Customers />,
	// Support: <Support />,
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
			{/* <Drawer.Screen name="Orders" component={Screen} />
			<Drawer.Screen name="Customers" component={Screen} />
			<Drawer.Screen name="Support" component={Screen} /> */}
		</Drawer.Navigator>
	);
};

export default MainNavigator;
