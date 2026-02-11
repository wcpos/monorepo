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
import { useCustomerNameFormat } from '../../hooks/use-customer-name-format';
import { useNumberFormat } from '../../hooks/use-number-format';
import { usePrint } from '../../hooks/use-print';
import { useReports } from '../context';

/**
 *
 */
export function Report() {
	const t = useT();
	const contentRef = React.useRef<View>(null);
	const { store, wpCredentials } = useAppState();
	const storeName = useObservableEagerState(store.name$) as string;
	const num_decimals = useObservableEagerState(store.price_num_decimals$) as number;
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
		query.rxQuery$.pipe(
			map(
				() => query.getSelector('date_created_gmt') as { $gte?: string; $lte?: string } | undefined
			)
		)
	);

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
				reportGenerated: t('reports.report_generated'),
				reportPeriodStart: t('reports.report_period_start'),
				reportPeriodEnd: t('reports.report_period_end'),
				cashier: t('common.cashier'),
				salesSummary: t('reports.sales_summary'),
				totalOrders: t('reports.total_orders'),
				totalNetSales: t('reports.total_net_sales'),
				totalTaxCollected: t('reports.total_tax_collected'),
				totalSales: t('reports.total_sales'),
				totalDiscounts: t('reports.total_discounts'),
				paymentMethods: t('reports.payment_methods'),
				unpaid: t('reports.unpaid'),
				unknown: t('common.unknown'),
				taxes: t('common.taxes'),
				shipping: t('common.shipping'),
				cashierStoreTotals: t('reports.cashier_store_totals'),
				cashierId: t('reports.cashier_id'),
				storeId: t('reports.store_id'),
				additionalInfo: t('reports.additional_info'),
				itemsSold: t('reports.items_sold'),
				averageOrderValue: t('reports.average_order_value'),
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
		contentRef: contentRef as React.RefObject<Element | null>,
		html,
	});

	return (
		<View className="h-full p-2 pt-0 pl-0">
			<Card className="flex-1">
				<CardHeader className="bg-card-header p-2">
					<HStack>
						<Text className="text-lg">{t('reports.report')}</Text>
						<Select
							value={{
								value: 'default',
								label: t('reports.default_offline'),
							}}
						>
							<SelectTrigger>
								<SelectValue placeholder={t('reports.select_report_template')} />
							</SelectTrigger>
							<SelectContent>
								<SelectItem label={t('reports.default_offline')} value="default" />
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
						<ButtonText>{t('reports.print')}</ButtonText>
					</Button>
				</CardFooter>
			</Card>
		</View>
	);
}
