import * as React from 'react';
import { useObservableSuspense, useObservableState, useObservable } from 'observable-hooks';
import { View } from 'react-native';
import Text from '../../../components/text';

interface Props {
	order: any;
}

const Totals = ({ order }: Props) => {
	// const order: any = useObservableState(order$);

	// if (!order) {
	// 	return null;
	// }

	return (
		<>
			<View style={{ flexDirection: 'row' }}>
				<View style={{ flex: 1 }}>
					<Text>Subtotal:</Text>
				</View>
				<View>
					<Text>{order.subtotal}</Text>
				</View>
			</View>
			<View style={{ flexDirection: 'row' }}>
				<View style={{ flex: 1 }}>
					<Text>Total Tax:</Text>
				</View>
				<View>
					<Text>{order.total_tax}</Text>
				</View>
			</View>
			<View style={{ flexDirection: 'row' }}>
				<View style={{ flex: 1 }}>
					<Text>Order Total:</Text>
				</View>
				<View>
					<Text>{order.total}</Text>
				</View>
			</View>
		</>
	);
};

export default Totals;
