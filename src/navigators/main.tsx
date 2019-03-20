import React from 'react';
import { createDrawerNavigator } from 'react-navigation';
import POS from '../sections/pos';
import Products from '../sections/products';
import Orders from '../sections/orders';
import Customers from '../sections/customers';
import Support from '../sections/support';
import SideBar from '../sections/sidebar';
import MasterBar from '../sections/masterbar';

type NavigationScreenProps = import('react-navigation').NavigationScreenProps;
type ScreenProps = NavigationScreenProps & { component: React.ReactElement };
type DrawerItemsProps = import('react-navigation').DrawerItemsProps;

const Screen = ({ navigation, component }: ScreenProps) => {
	return (
		<>
			<MasterBar navigation={navigation} />
			{component}
		</>
	);
};

const Drawer = createDrawerNavigator(
	{
		POS: {
			screen: (props: NavigationScreenProps) => <Screen {...props} component={<POS />} />,
		},
		Products: {
			screen: (props: NavigationScreenProps) => <Screen {...props} component={<Products />} />,
		},
		Orders: {
			screen: (props: NavigationScreenProps) => <Screen {...props} component={<Orders />} />,
		},
		Customers: {
			screen: (props: NavigationScreenProps) => <Screen {...props} component={<Customers />} />,
		},
		Support: {
			screen: (props: NavigationScreenProps) => <Screen {...props} component={<Support />} />,
		},
	},
	{
		initialRouteName: 'POS',
		contentComponent: (props: DrawerItemsProps) => <SideBar {...props} />,
	}
);

export default Drawer;
