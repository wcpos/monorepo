import * as React from 'react';
import { View, Text, FlatList } from 'react-native';

import type { OrderDocument } from '@wcpos/database';

import { calculateTotals } from './utils';

/**
 *
 */
export const ZReport = ({ orders }: { orders: OrderDocument[] }) => {
	const { paymentMethodTotals, taxTotals, discountTotal, userStoreTotals } =
		calculateTotals(orders);

	return (
		<View>
			<Text>Z-Report</Text>

			{/* Payment Method Totals */}
			<Text>Payment Methods:</Text>
			{Object.entries(paymentMethodTotals).map(([method, total]) => (
				<Text key={method}>
					{method}: ${total.toFixed(2)}
				</Text>
			))}

			{/* Tax Totals */}
			<Text>Taxes:</Text>
			{Object.entries(taxTotals).map(([label, total]) => (
				<Text key={label}>
					{label}: ${total.toFixed(2)}
				</Text>
			))}

			{/* Discounts */}
			<Text>Total Discounts:</Text>
			<Text>${discountTotal.toFixed(2)}</Text>

			{/* Meta Data Totals */}
			<Text>Cashier and Store Details:</Text>
			<FlatList
				data={userStoreTotals}
				keyExtractor={(item, index) => `${item.cashierId}-${index}`}
				renderItem={({ item }) => (
					<View>
						<Text>Cashier ID: {item.cashierId}</Text>
						<Text>Store ID: {item.storeId}</Text>
					</View>
				)}
			/>
		</View>
	);
};
