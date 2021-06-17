import * as React from 'react';
import { useNavigation, DrawerActions } from '@react-navigation/native';
import { createDrawerNavigator, DrawerNavigationOptions } from '@react-navigation/drawer';
import POS from '@wcpos/common/src/screens/pos';
import Products from '@wcpos/common/src/screens/products';
import Orders from '@wcpos/common/src/screens/orders';
import Customers from '@wcpos/common/src/screens/customers';
import Support from '@wcpos/common/src/screens/support';
import Button from '@wcpos/common/src/components/button';
import HeaderRight from '@wcpos/common/src/screens/header/right';

// type ScreenProps = {
// 	route: {
// 		name: Extract<keyof typeof components, string>;
// 	};
// };

// const components = {
// 	POS: <POS />,
// 	Products: <Products />,
// 	Orders: <Orders />,
// 	Customers: <Customers />,
// 	Support: <Support />,
// };

// const Screen = ({ route }: ScreenProps) => {
// 	return (
// 		<PageLayout header={<MasterBar />}>
// 			<ErrorBoundary>
// 				<React.Suspense fallback={<Text>{`Loading ${route.name} page...`}</Text>}>
// 					{components[route.name]}
// 				</React.Suspense>
// 			</ErrorBoundary>
// 		</PageLayout>
// 	);
// };

const Drawer = createDrawerNavigator();

const MainNavigator = () => {
	const navigation = useNavigation();

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
		<Drawer.Navigator screenOptions={screenOptions}>
			<Drawer.Screen name="POS" component={POS} />
			<Drawer.Screen name="Products" component={Products} />
			<Drawer.Screen name="Orders" component={Orders} />
			<Drawer.Screen name="Customers" component={Customers} />
			<Drawer.Screen name="Support" component={Support} />
		</Drawer.Navigator>
	);
};

export default MainNavigator;
