import React, { Component } from 'react';
import { View } from 'react-native';
import Text from '../../components/text';
import { Link } from '@react-navigation/web';

interface Props {}

class Menu extends Component<Props> {
	render() {
		return (
			<View>
				<Text>Menu</Text>
				<Link routeName="POS">POS</Link>
				<Link routeName="Products">Products</Link>
				<Link routeName="Orders">Orders</Link>
				<Link routeName="Customers">Customers</Link>
				<Link routeName="Support">Support</Link>
			</View>
		);
	}
}

export default Menu;
