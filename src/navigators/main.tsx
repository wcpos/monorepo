import React from 'react';
import { createDrawerNavigator } from 'react-navigation';
import POS from '../sections/pos';
import Products from '../sections/products';
import Orders from '../sections/orders';
import Customers from '../sections/customers';
import Support from '../sections/support';
import SideBar from '../sections/sidebar';

export default createDrawerNavigator(
	{
		POS,
		Products,
		Orders,
		Customers,
		Support,
	},
	{
		initialRouteName: 'POS',
		contentComponent: (props: any) => <SideBar {...props} />,
	}
);
