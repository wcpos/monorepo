import React from 'react';
import { View, Text } from 'react-native';

interface Props {
	orders: any;
}

const Tabs = ({ orders = [] }: Props) => (
	<View>
		{orders.map((order: any) => (
			<Text
				key={order.id}
				onPress={() => {
					console.log('update ui');
				}}
			>
				{order.number}
			</Text>
		))}
		<Text
			onPress={() => {
				console.log('update ui');
		}}>+</Text>
	</View>
);

export default Tabs;
