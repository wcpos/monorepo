import * as React from 'react';
import { ScrollView, View } from 'react-native';

import { useObservableEagerState } from 'observable-hooks';
import { map } from 'rxjs';

import { Button, ButtonText } from '@wcpos/components/button';
import { Card, CardContent, CardFooter, CardHeader } from '@wcpos/components/card';
import { HStack } from '@wcpos/components/hstack';
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@wcpos/components/select';
import { Text } from '@wcpos/components/text';

import { ZReport } from './template';
import { generateZReportHTML } from './generate-html';
import { calculateTotals } from './utils';
import { useAppState } from '../../../../contexts/app-state';
import { useT } from '../../../../contexts/translations';
import { convertUTCStringToLocalDate, useLocalDate } from '../../../../hooks/use-local-date';
import { useCurrencyFormat } from '../../hooks/use-currency-format';
import useCustomerNameFormat from '../../hooks/use-customer-name-format';
import { useNumberFormat } from '../../hooks/use-number-format';
import { usePrint } from '../../hooks/use-print';
import { useReports } from '../context';

/**
 *
 */
export const Report = () => {
	const t = useT();
	const contentRef = React.useRef<View>(null);
	const { store, wpCredentials } = useAppState();
	const storeName = useObservableEagerState(store.name$);
	const num_decimals = useObservableEagerState(store.price_num_decimals$);
	const { selectedOrders, query } = useReports();

	const { format: formatCurrency } = useCurrencyFormat();
	const { format: formatName } = useCustomerNameFormat();
	const { format: formatNumber } = useNumberFormat();
	const { formatDate } = useLocalDate();

	/**
	 * Calculate totals from selected orders
	 */
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

	/**
	 * Get date range from query
	 */
	const selectedDateRange = useObservableEagerState(
		query.rxQuery$.pipe(map(() => query.getSelector('date_created_gmt')))
	);

	const reportPeriod = React.useMemo(() => {
		const from = convertUTCStringToLocalDate(selectedDateRange.$gte);
		const to = convertUTCStringToLocalDate(selectedDateRange.$lte);

		return {
			from: formatDate(from, 'yyyy-M-dd HH:mm:ss'),
			to: formatDate(to, 'yyyy-M-dd HH:mm:ss'),
		};
	}, [formatDate, selectedDateRange.$gte, selectedDateRange.$lte]);

	/**
	 * Generate report timestamp
	 */
	const reportGenerated = React.useMemo(
		() => formatDate(new Date(), 'yyyy-M-dd HH:mm:ss'),
		[formatDate]
	);

	/**
	 * Generate HTML for native printing
	 */
	const html = React.useMemo(() => {
		return generateZReportHTML({
			storeName,
			storeId: store.id,
			reportGenerated,
			reportPeriod,
			cashierName: formatName(wpCredentials),
			cashierId: wpCredentials.id,
			totalOrders: selectedOrders?.length || 0,
			total: formatCurrency(total),
			totalTax: formatCurrency(totalTax),
			netSales: formatCurrency(total - totalTax),
			discountTotal: formatCurrency(discountTotal),
			paymentMethodsArray: paymentMethodsArray.map((pm) => ({
				...pm,
				total: formatCurrency(pm.total),
			})),
			taxTotalsArray: taxTotalsArray.map((tax) => ({
				...tax,
				total: formatCurrency(tax.total),
			})),
			shippingTotalsArray: shippingTotalsArray.map((s) => ({
				...s,
				total: formatCurrency(s.total),
			})),
			userStoreArray: userStoreArray.map((us) => ({
				...us,
				totalAmount: formatCurrency(us.totalAmount),
			})),
			totalItemsSold: formatNumber(totalItemsSold),
			averageOrderValue: formatCurrency(averageOrderValue),
			t: {
				reportGenerated: t('Report Generated'),
				reportPeriodStart: t('Report Period Start'),
				reportPeriodEnd: t('Report Period End'),
				cashier: t('Cashier'),
				salesSummary: t('Sales Summary'),
				totalOrders: t('Total Orders'),
				totalNetSales: t('Total Net Sales'),
				totalTaxCollected: t('Total Tax Collected'),
				totalSales: t('Total Sales'),
				totalDiscounts: t('Total Discounts'),
				paymentMethods: t('Payment Methods'),
				unpaid: t('UNPAID'),
				unknown: t('Unknown'),
				taxes: t('Taxes'),
				shipping: t('Shipping'),
				cashierStoreTotals: t('Cashier/Store Totals'),
				cashierId: t('Cashier ID'),
				storeId: t('Store ID'),
				additionalInfo: t('Additional Info'),
				itemsSold: t('Items Sold'),
				averageOrderValue: t('Average Order Value'),
			},
		});
	}, [
		storeName,
		store.id,
		reportGenerated,
		reportPeriod,
		formatName,
		wpCredentials,
		selectedOrders?.length,
		formatCurrency,
		total,
		totalTax,
		discountTotal,
		paymentMethodsArray,
		taxTotalsArray,
		shippingTotalsArray,
		userStoreArray,
		formatNumber,
		totalItemsSold,
		averageOrderValue,
		t,
	]);

	/**
	 * Cross-platform print hook
	 * - Web: uses contentRef with react-to-print
	 * - Native: uses html with expo-print
	 */
	const { print, isPrinting } = usePrint({
		contentRef,
		html,
	});

	return (
		<View className="h-full p-2 pt-0 pl-0">
			<Card className="flex-1">
				<CardHeader className="bg-card-header p-2">
					<HStack>
						<Text className="text-lg">{t('Report')}</Text>
						<Select
							value={{
								value: 'default',
								label: t('Default (Offline)'),
							}}
						>
							<SelectTrigger>
								<SelectValue placeholder={t('Select report template')} />
							</SelectTrigger>
							<SelectContent>
								<SelectItem label={t('Default (Offline)')} value="default" />
							</SelectContent>
						</Select>
					</HStack>
				</CardHeader>
				<CardContent className="flex-1 p-0">
					<ScrollView horizontal={false} className="w-full">
						<View ref={contentRef} style={{ width: '100%', height: '100%', padding: 10 }}>
							<ZReport />
						</View>
					</ScrollView>
				</CardContent>
				<CardFooter className="border-border bg-footer justify-end border-t p-2">
					<Button onPress={print} loading={isPrinting}>
						<ButtonText>{t('Print')}</ButtonText>
					</Button>
				</CardFooter>
			</Card>
		</View>
	);
};
