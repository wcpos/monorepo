import * as React from 'react';
import type { ViewInstance } from 'react-native';

import { useDocField } from '@wcpos/query';

import { generateZReportHTML } from './generate-html';
import { calculateTotals } from './utils';
import {
	useRegisterNames,
	useRegisterNamesReady,
} from '../../../../services/register/use-register-names';
import { useStoreSession } from '../../../../contexts/app-state';
import { useT } from '../../../../contexts/translations';
import { convertUTCStringToLocalDate, useLocalDate } from '../../../../hooks/use-local-date';
import { inZone, useStoreDay, useViewedStore } from '../../../../hooks/use-store-day';
import { useCurrencyFormat } from '../../hooks/use-currency-format';
import { useNumberFormat } from '../../hooks/use-number-format';
import { usePrint } from '../../hooks/use-print';
import { useReportsData } from '../context';
import { useReportCashier } from './use-report-cashier';
import { useQueryState } from '../../../../query';

/** The printed report is the viewed store's (a Pro cashier may report on another store). */
export function useReportPrint(storeId?: number) {
	const t = useT();
	const registerNames = useRegisterNames(storeId);
	// Printing waits for the store's register list: a name not yet read must not print as an id.
	const ready = useRegisterNamesReady(storeId);
	const contentRef = React.useRef<ViewInstance>(null);
	const { store } = useStoreSession();
	const cashier = useReportCashier();
	const viewed = useDocField(useViewedStore(storeId), (value) => value);
	const sessionName = useDocField(store, (value) => value.name);
	const storeName = (viewed?.name ?? sessionName) as string;
	const num_decimals = viewed?.price_num_decimals as number;
	const { selectedOrders } = useReportsData();
	const selectedDateRange = useQueryState<'orders', { from: string; to: string } | undefined>(
		(state) => state.filters.dateRange
	);

	const options = {
		decimalScale: viewed?.price_num_decimals,
		decimalSeparator: viewed?.price_decimal_sep,
		thousandSeparator: viewed?.price_thousand_sep,
		thousandsGroupStyle: viewed?.thousands_group_style,
	};
	const { format: formatCurrency } = useCurrencyFormat({
		...options,
		currency: viewed?.currency,
		currencyPosition: viewed?.currency_pos,
	});
	const { format: formatNumber } = useNumberFormat(options);
	const { formatDate } = useLocalDate();
	const { timezone } = useStoreDay(storeId);

	/**
	 * Calculate totals from selected orders
	 */
	const {
		total,
		refundTotal,
		paymentMethodsArray,
		taxTotalsArray,
		totalTax,
		discountTotal,
		userStoreArray,
		registerArray,
		totalItemsSold,
		shippingTotalsArray,
		averageOrderValue,
	} = calculateTotals({ orders: selectedOrders, num_decimals });

	const reportPeriod = React.useMemo(() => {
		const from = selectedDateRange?.from
			? convertUTCStringToLocalDate(selectedDateRange.from)
			: new Date();
		const to = selectedDateRange?.to
			? convertUTCStringToLocalDate(selectedDateRange.to)
			: new Date();

		// The period is the store's day, so it is labelled in the store's zone, not the till's.
		return {
			from: formatDate(inZone(timezone, from), 'yyyy-M-dd HH:mm:ss'),
			to: formatDate(inZone(timezone, to), 'yyyy-M-dd HH:mm:ss'),
		};
	}, [formatDate, selectedDateRange, timezone]);

	/**
	 * Generate report timestamp
	 */
	const reportGenerated = React.useMemo(
		() => formatDate(inZone(timezone, new Date()), 'yyyy-M-dd HH:mm:ss'),
		[formatDate, timezone]
	);

	/**
	 * Generate HTML for native printing
	 */
	const html = React.useMemo(() => {
		return generateZReportHTML({
			storeName,
			storeId: viewed?.id ?? store.id!,
			reportGenerated,
			reportPeriod,
			cashierName: cashier.name,
			cashierId: cashier.id,
			totalOrders: selectedOrders?.length || 0,
			total: formatCurrency(total),
			totalTax: formatCurrency(totalTax),
			netSales: formatCurrency(total - totalTax),
			discountTotal: formatCurrency(discountTotal),
			refundTotal: refundTotal > 0 ? formatCurrency(-refundTotal) : '',
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
			registerArray: registerArray.map(({ registerId, totalOrders, totalAmount }) => ({
				registerId,
				name: registerNames[registerId] || registerId.slice(0, 8),
				totalOrders,
				totalAmount: formatCurrency(totalAmount),
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
				totalRefunds: t('reports.total_refunds', { _default: 'Total Refunds' }),
				paymentMethods: t('reports.payment_methods'),
				unpaid: t('reports.unpaid'),
				unknown: t('common.unknown'),
				taxes: t('common.taxes'),
				shipping: t('common.shipping'),
				cashierStoreTotals: t('reports.cashier_store_totals'),
				byRegister: t('reports.by_register'),
				cashierId: t('reports.cashier_id'),
				storeId: t('reports.store_id'),
				additionalInfo: t('reports.additional_info'),
				itemsSold: t('reports.items_sold'),
				averageOrderValue: t('reports.average_order_value'),
			},
		});
	}, [
		storeName,
		viewed?.id,
		store.id,
		reportGenerated,
		reportPeriod,
		cashier.name,
		cashier.id,
		selectedOrders?.length,
		formatCurrency,
		total,
		totalTax,
		discountTotal,
		refundTotal,
		paymentMethodsArray,
		taxTotalsArray,
		shippingTotalsArray,
		userStoreArray,
		registerArray,
		registerNames,
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

	return { print, isPrinting, contentRef, ready };
}
