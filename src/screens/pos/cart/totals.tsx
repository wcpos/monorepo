import * as React from 'react';
import { useObservableSuspense, useObservableState, useObservable } from 'observable-hooks';
import { View } from 'react-native';
import Text from '@wcpos/common/src/components/text';

type OrderDocument = import('@wcpos/common/src/database').OrderDocument;

interface Props {
	order: OrderDocument;
}

const Totals = ({ order }: Props) => {
	const total = useObservableState(order.computedTotal$(), order.total);

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
					<Text>{total}</Text>
				</View>
			</View>
		</>
	);
};

export default Totals;
