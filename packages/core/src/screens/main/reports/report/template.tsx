import * as React from 'react';
import { View } from 'react-native';

import { useFocusEffect } from '@react-navigation/native';
import { useObservableEagerState } from 'observable-hooks';
import { map } from 'rxjs';

import { Text, Row, Line, Br } from '@wcpos/components/src/print';

import { calculateTotals } from './utils';
import { useAppState } from '../../../../contexts/app-state';
import { useT } from '../../../../contexts/translations';
import { useLocalDate, convertUTCStringToLocalDate } from '../../../../hooks/use-local-date';
import { useCurrencyFormat } from '../../hooks/use-currency-format';
import useCustomerNameFormat from '../../hooks/use-customer-name-format';
import { useNumberFormat } from '../../hooks/use-number-format';
import { useReports } from '../context';

/**
 *
 */
export const ZReport = () => {
	const t = useT();
	const { store, wpCredentials } = useAppState();
	const storeName = useObservableEagerState(store.name$);
	const num_decimals = useObservableEagerState(store.price_num_decimals$);
	const { selectedOrders, query } = useReports();
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
	} = calculateTotals({ orders: selectedOrders, num_decimals });

	const selectedDateRange = useObservableEagerState(
		query.rxQuery$.pipe(map(() => query.getSelector('date_created_gmt')))
	);

	const { format: formatCurrency } = useCurrencyFormat();
	const { format: formatName } = useCustomerNameFormat();
	const { format: formatNumber } = useNumberFormat();
	const { formatDate } = useLocalDate();

	/**
	 *
	 */
	const reportPeriod = React.useMemo(() => {
		const from = convertUTCStringToLocalDate(selectedDateRange.$gte);
		const to = convertUTCStringToLocalDate(selectedDateRange.$lte);

		return {
			from: formatDate(from, 'yyyy-M-dd HH:mm:ss'),
			to: formatDate(to, 'yyyy-M-dd HH:mm:ss'),
		};
	}, [formatDate, selectedDateRange.$gte, selectedDateRange.$lte]);

	/**
	 * Create a report generated date string when:
	 * - the screen is focused
	 * - the selected orders change
	 */
	const [reportGenerated, setReportGenerated] = React.useState(
		formatDate(new Date(), 'yyyy-M-dd HH:mm:ss')
	);
	useFocusEffect(
		React.useCallback(() => {
			setReportGenerated(formatDate(new Date(), 'yyyy-M-dd HH:mm:ss'));
		}, [formatDate])
	);
	React.useEffect(() => {
		setReportGenerated(formatDate(new Date(), 'yyyy-M-dd HH:mm:ss'));
	}, [
		// update the report generated date when the selected orders change
		selectedOrders,
	]);

	return (
		<View>
			<Text bold>
				{storeName} (ID: {store.id})
			</Text>
			<Text>{`${t('Report Generated', { _tags: 'core' })}: ${reportGenerated}`}</Text>
			<Text>{`${t('Report Period Start', { _tags: 'core' })}: ${reportPeriod.from}`}</Text>
			<Text>{`${t('Report Period End', { _tags: 'core' })}: ${reportPeriod.to}`}</Text>
			<Text>{`${t('Cashier', { _tags: 'core' })}: ${formatName(wpCredentials)} (ID: ${wpCredentials.id})`}</Text>
			<Br />

			<Line />
			<Text uppercase align="center">
				{t('Sales Summary', { _tags: 'core' })}
			</Text>
			<Line />
			<Row>
				<Text>Total Orders:</Text>
				<Text align="right">{selectedOrders?.length || 0}</Text>
			</Row>
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

			{userStoreArray.length > 1 && (
				<>
					<Line />
					<Text uppercase align="center">
						{t('Cashier/Store Totals', { _tags: 'core' })}
					</Text>
					<Line />
					{userStoreArray.map(({ cashierId, storeId, totalOrders, totalAmount }) => (
						<Row key={`${cashierId}-${storeId}`}>
							<Text className="flex-1">{`${t('Cashier ID', { _tags: 'core' })}: ${cashierId} - ${t('Store ID', { _tags: 'core' })}: ${storeId}`}</Text>
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
