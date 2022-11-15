import * as React from 'react';

import { useObservableState } from 'observable-hooks';

import Box from '@wcpos/components/src/box';
import Button from '@wcpos/components/src/button';

import useStore from '../../../contexts/store';
// import Checkout from '../pos/checkout';
// import Settings from '../settings';
// import Receipt from '../receipt';

const Support = () => {
	const { storeDB } = useStore();
	// const order = useObservableState(storeDB.orders.findOne({ selector: { status: 'pos-open' } }).$);
	const totalProducts = useObservableState(storeDB?.products.totalDocCount$, 0);
	const totalVariations = useObservableState(storeDB?.variations.totalDocCount$, 0);
	const totalOrders = useObservableState(storeDB?.orders.totalDocCount$, 0);
	const totalCustomers = useObservableState(storeDB?.customers.totalDocCount$, 0);
	const totalTaxes = useObservableState(storeDB?.taxes.totalDocCount$, 0);
	const totalLineItems = useObservableState(storeDB?.line_items.totalDocCount$, 0);
	const totalFeeLines = useObservableState(storeDB?.fee_lines.totalDocCount$, 0);
	const totalShippingLines = useObservableState(storeDB?.shipping_lines.totalDocCount$, 0);

	return (
		<Box space="small">
			<Button
				title={`Clear ${totalProducts} Products`}
				onPress={() => {
					storeDB?.products.remove();
				}}
			/>
			<Button
				title={`Clear ${totalVariations} Variations`}
				onPress={() => {
					storeDB?.variations.remove();
				}}
			/>
			<Button
				title={`Clear ${totalOrders} Orders`}
				onPress={() => {
					storeDB?.orders.remove();
				}}
			/>
			<Button
				title={`Clear ${totalCustomers} Customers`}
				onPress={() => {
					storeDB?.customers.remove();
				}}
			/>
			<Button
				title={`Clear ${totalTaxes} Taxes`}
				onPress={() => {
					storeDB?.taxes.remove();
				}}
			/>
			<Button
				title={`Clear ${totalLineItems} Line Items`}
				onPress={() => {
					storeDB?.line_items.remove();
				}}
			/>
			<Button
				title={`Clear ${totalFeeLines} Fee Lines`}
				onPress={() => {
					storeDB?.fee_lines.remove();
				}}
			/>
			<Button
				title={`Clear ${totalShippingLines} Shipping Lines`}
				onPress={() => {
					storeDB?.shipping_lines.remove();
				}}
			/>
		</Box>
	);
};

export default Support;
