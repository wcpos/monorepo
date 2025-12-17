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
				reportGenerated: t('Report Generated', { _tags: 'core' }),
				reportPeriodStart: t('Report Period Start', { _tags: 'core' }),
				reportPeriodEnd: t('Report Period End', { _tags: 'core' }),
				cashier: t('Cashier', { _tags: 'core' }),
				salesSummary: t('Sales Summary', { _tags: 'core' }),
				totalOrders: t('Total Orders', { _tags: 'core' }),
				totalNetSales: t('Total Net Sales', { _tags: 'core' }),
				totalTaxCollected: t('Total Tax Collected', { _tags: 'core' }),
				totalSales: t('Total Sales', { _tags: 'core' }),
				totalDiscounts: t('Total Discounts', { _tags: 'core' }),
				paymentMethods: t('Payment Methods', { _tags: 'core' }),
				unpaid: t('UNPAID', { _tags: 'core' }),
				unknown: t('Unknown', { _tags: 'core' }),
				taxes: t('Taxes', { _tags: 'core' }),
				shipping: t('Shipping', { _tags: 'core' }),
				cashierStoreTotals: t('Cashier/Store Totals', { _tags: 'core' }),
				cashierId: t('Cashier ID', { _tags: 'core' }),
				storeId: t('Store ID', { _tags: 'core' }),
				additionalInfo: t('Additional Info', { _tags: 'core' }),
				itemsSold: t('Items Sold', { _tags: 'core' }),
				averageOrderValue: t('Average Order Value', { _tags: 'core' }),
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
		<View className="h-full p-2 pl-0 pt-0">
			<Card className="flex-1">
				<CardHeader className="bg-card-header p-2">
					<HStack>
						<Text className="text-lg">{t('Report', { _tags: 'core' })}</Text>
						<Select
							value={{
								value: 'default',
								label: t('Default (Offline)', { _tags: 'core' }),
							}}
						>
							<SelectTrigger>
								<SelectValue placeholder={t('Select report template', { _tags: 'core' })} />
							</SelectTrigger>
							<SelectContent>
								<SelectItem label={t('Default (Offline)', { _tags: 'core' })} value="default" />
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
						<ButtonText>{t('Print', { _tags: 'core' })}</ButtonText>
					</Button>
				</CardFooter>
			</Card>
		</View>
	);
};
