import React, { Fragment } from 'react';
import { createNavigator, SceneView, NavigationActions } from '@react-navigation/core';
import DrawerRouter from 'react-navigation-drawer/lib/module/routers/DrawerRouter';
import { View } from 'react-native';
import POS from '../sections/pos';
import Products from '../sections/products';
import Orders from '../sections/orders';
import Customers from '../sections/customers';
import Support from '../sections/support';
import MasterBar from '../sections/masterbar';
import SideBar from '../sections/sidebar';
import Layout from '../components/layout';

type NavigationView = import('react-navigation').NavigationView<{}, {}>;
type DrawerItem = import('react-navigation').DrawerItem;

/**
 * react-navigation DrawerView is not compatible with web ... yet
 * based on:
 * https://github.com/react-navigation/react-navigation-drawer/blob/master/src/views/DrawerView.js
 * https://github.com/react-navigation/drawer/blob/master/src/views/DrawerView.tsx
 */
const DrawerView: NavigationView = ({ descriptors, navigation }) => {
	const activeKey = navigation.state.routes[navigation.state.index].key;
	const descriptor = descriptors[activeKey];
	// @ts-ignore
	// const { openId, closeId } = navigation.state;
	// const [state, setState] = useState({ open: false, openId, closeId });

	// if (state.openId !== openId) {
	// 	setState({ open: true, openId: openId, closeId: state.closeId });
	// }

	// if (state.closeId !== closeId) {
	// 	setState({ open: false, closeId: closeId, openId: state.openId });
	// }

	const handleItemPress = ({ route, focused }: DrawerItem) => {
		if (focused) {
			navigation.closeDrawer();
		} else {
			navigation.dispatch(NavigationActions.navigate({ routeName: route.routeName }));
		}
	};

	return (
		<Fragment>
			<Layout
				masterbar={
					<MasterBar navigation={descriptor.navigation} title={descriptor.state.routeName} />
				}
				main={
					<SceneView
						component={descriptor.getComponent()}
						navigation={descriptor.navigation}
						style={{ flex: 1 }}
					/>
				}
			></Layout>
			{navigation.state.isDrawerOpen && (
				<View
					style={{
						backgroundColor: 'rgba(00, 00, 00, 0.1)',
						position: 'absolute',
						top: 0,
						left: 0,
						display: 'flex',
						flexDirection: 'column',
						zIndex: 1000,
						height: '100%',
						width: '100%',
					}}
				>
					<SideBar
						activeItemKey={activeKey}
						items={navigation.state.routes}
						onItemPress={handleItemPress}
					/>
				</View>
			)}
		</Fragment>
	);
};

const AuthStack = createNavigator(
	DrawerView,
	DrawerRouter(
		{
			POS: {
				screen: POS,
				path: 'cart',
			},
			Products: {
				screen: Products,
				path: 'products',
			},
			Orders: {
				screen: Orders,
				path: 'orders',
			},
			Customers: {
				screen: Customers,
				path: 'customers',
			},
			Support: {
				screen: Support,
				path: 'support',
			},
		},
		{}
	),
	{ initialRouteName: 'POS' }
);

export default AuthStack;
