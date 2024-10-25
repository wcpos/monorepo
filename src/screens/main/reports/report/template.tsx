import * as React from 'react';
import { View } from 'react-native';

import { format as formatDate } from 'date-fns';
import { useObservableEagerState } from 'observable-hooks';

import { Text, Row, Line, Br } from '@wcpos/components/src/print';
import type { OrderDocument } from '@wcpos/database';

import { calculateTotals } from './utils';
import { useAppState } from '../../../../contexts/app-state';
import { useT } from '../../../../contexts/translations';
import { useCurrencyFormat } from '../../hooks/use-currency-format';
import useCustomerNameFormat from '../../hooks/use-customer-name-format';
import { useNumberFormat } from '../../hooks/use-number-format';

/**
 *
 */
export const ZReport = ({ orders }: { orders: OrderDocument[] }) => {
	const t = useT();
	const { store, wpCredentials } = useAppState();
	const storeName = useObservableEagerState(store.name$);
	const num_decimals = useObservableEagerState(store.price_num_decimals$);
	const {
		total,
		paymentMethodsArray,
		taxTotalsArray,
		totalTax,
		discountTotal,
		userStoreArray,
		totalItemsSold,
		shippingTotalsArray,
		averageOrderValue,
	} = calculateTotals({ orders, num_decimals });
	const { format: formatCurrency } = useCurrencyFormat();
	const { format: formatName } = useCustomerNameFormat();
	const { format: formatNumber } = useNumberFormat();

	return (
		<View>
			<Text bold>{storeName}</Text>
			<Text>{`${t('Report Generated', { _tags: 'core' })}: ${formatDate(new Date(), 'yyyy-M-dd HH:mm:ss')}`}</Text>
			<Text>{`${t('Report Period', { _tags: 'core' })}: 2024-10-24`}</Text>
			<Text>{`${t('Cashier', { _tags: 'core' })}: ${formatName(wpCredentials)} (ID: ${wpCredentials.id})`}</Text>
			<Br />

			<Line />
			<Text uppercase align="center">
				{t('Sales Summary', { _tags: 'core' })}
			</Text>
			<Line />
			<Row>
				<Text>Total Net Sales:</Text>
				<Text align="right">{formatCurrency(total - totalTax)}</Text>
			</Row>
			<Row>
				<Text>Total Tax Collected:</Text>
				<Text align="right">{formatCurrency(totalTax)}</Text>
			</Row>
			<Row>
				<Text bold>Total Sales:</Text>
				<Text bold align="right">
					{formatCurrency(total)}
				</Text>
			</Row>
			<Row>
				<Text>Total Discounts:</Text>
				<Text align="right">{formatCurrency(discountTotal)}</Text>
			</Row>
			<Br />

			<Line />
			<Text uppercase align="center">
				{t('Payment Methods', { _tags: 'core' })}
			</Text>
			<Line />
			{paymentMethodsArray.map(({ payment_method, payment_method_title, total }) => {
				let label = payment_method_title;
				if (payment_method === 'unpaid') {
					label = t('UNPAID', { _tags: 'core' });
				} else if (payment_method === 'unknown') {
					label = t('Unknown', { _tags: 'core' });
				}
				return (
					<Row key={payment_method}>
						<Text>{label}:</Text>
						<Text align="right">{formatCurrency(total)}</Text>
					</Row>
				);
			})}
			<Br />

			<Line />
			<Text uppercase align="center">
				{t('Taxes', { _tags: 'core' })}
			</Text>
			<Line />
			{taxTotalsArray.map(({ rate_id, label, total }) => (
				<Row key={rate_id}>
					<Text>{label}:</Text>
					<Text align="right">{formatCurrency(total)}</Text>
				</Row>
			))}
			<Br />

			{shippingTotalsArray.length > 0 && (
				<>
					<Line />
					<Text uppercase align="center">
						{t('Shipping', { _tags: 'core' })}
					</Text>
					<Line />
					{shippingTotalsArray.map(({ method_id, total, total_tax }) => (
						<Row key={method_id}>
							<Text>{method_id}:</Text>
							<Text align="right">{formatCurrency(total)}</Text>
						</Row>
					))}
					<Br />
				</>
			)}

			{userStoreArray.length > 0 && (
				<>
					<Line />
					<Text uppercase align="center">
						{t('Cashier/Store Totals', { _tags: 'core' })}
					</Text>
					<Line />
					{userStoreArray.map(({ cashierId, storeId, totalOrders, totalAmount }) => (
						<Row key={`${cashierId}-${storeId}`}>
							<Text>{`${cashierId} - ${storeId}`}</Text>
							<Text align="right">{totalOrders}</Text>
							<Text align="right">{formatCurrency(totalAmount)}</Text>
						</Row>
					))}
					<Br />
				</>
			)}

			<Line />
			<Text uppercase align="center">
				{t('Additional Info', { _tags: 'core' })}
			</Text>
			<Line />
			<Row>
				<Text>Total Orders:</Text>
				<Text align="right">{orders?.length || 0}</Text>
			</Row>
			<Row>
				<Text>Items Sold:</Text>
				<Text align="right">{formatNumber(totalItemsSold)}</Text>
			</Row>
			<Row>
				<Text>Average Order Value:</Text>
				<Text align="right">{formatCurrency(averageOrderValue)}</Text>
			</Row>
			<Br />
		</View>
	);
};
