import { useDocField } from '@wcpos/query';

import { useAppState } from '../../contexts/app-state';
import { useT } from '../../contexts/translations';
import { useLocale } from '../../hooks/use-locale';
import { useStoreDay } from '../../hooks/use-store-day';
import { useCurrencyFormat } from '../../screens/main/hooks/use-currency-format';

import type { ClosureContext } from './closure-document';

// Offline defaults use the same label keys as the shipped server closure template.
const labelKeys = {
	x_report: 'register.x_report',
	closure: 'reports.document.closure',
	opened: 'reports.document.opened',
	closed: 'register.closed',
	approver: 'reports.document.approver',
	opening_float: 'reports.document.opening_float',
	expected: 'reports.document.expected',
	counted: 'register.counted',
	variance: 'register.variance',
	tenders: 'reports.document.tenders',
	tender: 'reports.document.tender',
	cash_movements: 'reports.document.cash_movements',
	time: 'common.time',
	type: 'common.type',
	amount: 'register.amount',
	reason: 'register.reason',
	sales: 'reports.sales',
	period_sales: 'register.period_sales',
	period_refunds: 'register.period_refunds',
	transactions: 'reports.document.transactions',
	refunds: 'common.refunds',
	payment_method: 'reports.document.payment_method',
	cashiers: 'reports.document.cashiers',
	tax_rates: 'common.tax_rates',
	tax_rate: 'reports.document.tax_rate',
	net: 'reports.document.net',
	tax: 'common.tax',
	gross: 'reports.document.gross',
	perpetual_totals: 'reports.document.perpetual_totals',
	perpetual_sales: 'register.perpetual_sales',
	perpetual_refunds: 'register.perpetual_refunds',
	unsynced_sales: 'reports.document.unsynced_sales',
	short: 'reports.document.short',
	over: 'reports.document.over',
	exact: 'reports.exact',
	voided: 'pos_checkout.status_voided',
	paid_in: 'register.paid_in',
	paid_out: 'register.paid_out',
	no_sale: 'register.no_sale',
	void: 'register.void',
	copy: 'reports.document.copy',
};
export function useClosureDocumentContext(): ClosureContext {
	const { store } = useAppState();
	const data = useDocField(store, (value) => value);
	const { timezone } = useStoreDay();
	const { code } = useLocale();
	const { format } = useCurrencyFormat();
	const t = useT();
	return {
		store: {
			...data,
			name: data?.name ?? '',
			address_lines: [
				data?.store_address,
				data?.store_address_2,
				data?.store_city,
				data?.store_postcode,
			].filter(Boolean),
		},
		currency: data?.currency ?? '',
		timezone,
		locale: code,
		printedAt: new Date().toISOString(),
		formatMoney: (value) => (value === '' ? '' : format(Number(value))),
		i18n: {
			...Object.fromEntries(Object.entries(labelKeys).map(([key, value]) => [key, t(value)])),
			...data?.receipt_i18n,
		},
	};
}
