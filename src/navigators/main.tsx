import React from 'react';
import { createDrawerNavigator } from '@react-navigation/drawer';
import PageLayout from '../layout/page';
import MasterBar from '../layout/masterbar';
import ErrorBoundary from '../components/error';
import POS from '../pages/pos';
import Products from '../pages/products';
// import Orders from '../sections/orders';
// import Customers from '../sections/customers';
import Support from '../pages/support';
import Text from '../components/text';
import useUI from '../hooks/use-ui';
import useDataResource from '../hooks/use-data-resource';

const Screen = ({ route, navigation }) => {
	const components = {
		POS: <POS productsResource={useDataResource('products')} uiResource={useUI('pos_products')} />,
		Products: (
			<Products productsResource={useDataResource('products')} uiResource={useUI('products')} />
		),
		Support: <Support />,
	};

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

const MainNavigator: React.FC = () => {
	return (
		<Drawer.Navigator>
			<Drawer.Screen name="POS" component={Screen} />
			<Drawer.Screen name="Products" component={Screen} />
			<Drawer.Screen name="Support" component={Screen} />
		</Drawer.Navigator>
	);
};

export default MainNavigator;
