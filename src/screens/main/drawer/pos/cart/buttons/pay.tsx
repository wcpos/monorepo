import * as React from 'react';

import { useNavigation, StackActions } from '@react-navigation/native';
import { useObservableState } from 'observable-hooks';

import Button from '@wcpos/components/src/button';

import useCurrencyFormat from '../../../../../../hooks/use-currency-format';
import useRestHttpClient from '../../../../../../hooks/use-rest-http-client';
import { t } from '../../../../../../lib/translations';

interface PayModalProps {
	order: import('@wcpos/database').OrderDocument;
}

/**
 *
 */
const PayButton = ({ order }: PayModalProps) => {
	const total = useObservableState(order.total$, order.total);
	const { format } = useCurrencyFormat();
	const http = useRestHttpClient();
	const navigation = useNavigation();

	/**
	 *
	 */
	// const saveOrder = React.useCallback(async () => {
	// 	const data = await order.toRestApiJSON();
	// 	let endpoint = 'orders';
	// 	if (order.id) {
	// 		endpoint += `/${order.id}`;
	// 	}

	// 	const result = await http.post(endpoint, {
	// 		data,
	// 	});

	// 	if (result.status === 201 || result.status === 200) {
	// 		// @TODO - this should be part of the parseRestResponse
	// 		await order.collection.upsertChildren(result.data);
	// 		return order.atomicPatch(result.data);
	// 		// if (order.id) {
	// 		// 	await order.collection.upsertChildren(result.data);

	// 		// 	// const parsed = order.collection.parseRestResponse(result.data);

	// 		// 	order.atomicPatch(result.data);
	// 		// 	return order;
	// 		// }
	// 		// await order.collection.upsertChildren(result.data);
	// 		// const newOrder = await order.collection.insert(result.data);
	// 		// // switcharoo
	// 		// await order.remove();
	// 		// setCurrentOrder(newOrder);
	// 		// return newOrder;
	// 	}
	// }, [http, order]);

	/**
	 *
	 */
	const handlePay = React.useCallback(() => {
		// saveOrder();
		// navigation.navigate('Checkout', { orderID: order.uuid });
		navigation.dispatch(StackActions.push('Checkout', { orderID: order.uuid }));

		// saveOrder().then((o) => {
		// 	if (o) {
		// 		navigation.navigate('Checkout', { _id: o._id });
		// 	}
		// });
	}, [navigation, order.uuid]);

	/**
	 *
	 */
	return (
		<Button
			fill
			size="large"
			title={t('Checkout {order_total}', { order_total: format(total || 0), _tags: 'core' })}
			onPress={handlePay}
			type="success"
			style={{
				flex: 3,
				borderTopLeftRadius: 0,
				borderTopRightRadius: 0,
				borderBottomLeftRadius: 0,
			}}
		/>
	);
};

export default PayButton;
