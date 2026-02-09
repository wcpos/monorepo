import * as React from 'react';
import { View } from 'react-native';

import { useFocusEffect } from 'expo-router';
import { useObservableEagerState } from 'observable-hooks';
import { map } from 'rxjs';

import { Br, Line, Row, Text } from '@wcpos/components/print';

import { calculateTotals } from './utils';
import { useAppState } from '../../../../contexts/app-state';
import { useT } from '../../../../contexts/translations';
import { convertUTCStringToLocalDate, useLocalDate } from '../../../../hooks/use-local-date';
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
	const storeName = useObservableEagerState(store.name$) as string;
	const num_decimals = useObservableEagerState(store.price_num_decimals$) as number;
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
		query.rxQuery$.pipe(
			map(
				() => query.getSelector('date_created_gmt') as { $gte?: string; $lte?: string } | undefined
			)
		)
	);

	const { format: formatCurrency } = useCurrencyFormat();
	const { format: formatName } = useCustomerNameFormat();
	const { format: formatNumber } = useNumberFormat();
	const { formatDate } = useLocalDate();

	/**
	 *
	 */
	const reportPeriod = React.useMemo(() => {
		const from = selectedDateRange?.$gte
			? convertUTCStringToLocalDate(selectedDateRange.$gte)
			: new Date();
		const to = selectedDateRange?.$lte
			? convertUTCStringToLocalDate(selectedDateRange.$lte)
			: new Date();

		return {
			from: formatDate(from, 'yyyy-M-dd HH:mm:ss'),
			to: formatDate(to, 'yyyy-M-dd HH:mm:ss'),
		};
	}, [formatDate, selectedDateRange?.$gte, selectedDateRange?.$lte]);

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
			<Text>{`${t('reports.report_generated')}: ${reportGenerated}`}</Text>
			<Text>{`${t('reports.report_period_start')}: ${reportPeriod.from}`}</Text>
			<Text>{`${t('reports.report_period_end')}: ${reportPeriod.to}`}</Text>
			<Text>{`${t('common.cashier')}: ${formatName(wpCredentials)} (ID: ${wpCredentials.id})`}</Text>
			<Br />

			<Line />
			<Text uppercase align="center">
				{t('reports.sales_summary')}
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
				{t('reports.payment_methods')}
			</Text>
			<Line />
			{paymentMethodsArray.map(({ payment_method, payment_method_title, total }) => {
				let label = payment_method_title;
				if (payment_method === 'unpaid') {
					label = t('reports.unpaid');
				} else if (payment_method === 'unknown') {
					label = t('common.unknown');
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
				{t('common.taxes')}
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
						{t('common.shipping')}
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
						{t('reports.cashier_store_totals')}
					</Text>
					<Line />
					{userStoreArray.map(({ cashierId, storeId, totalOrders, totalAmount }) => (
						<Row key={`${cashierId}-${storeId}`}>
							<Text className="flex-1">{`${t('reports.cashier_id')}: ${cashierId} - ${t('reports.store_id')}: ${storeId}`}</Text>
							<Text align="right">{totalOrders}</Text>
							<Text align="right">{formatCurrency(totalAmount)}</Text>
						</Row>
					))}
					<Br />
				</>
			)}

			<Line />
			<Text uppercase align="center">
				{t('reports.additional_info')}
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
