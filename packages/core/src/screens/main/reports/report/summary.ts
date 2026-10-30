import sumBy from 'lodash/sumBy';

import { refundsSummary } from '../cards/aggregate';

import type { RefundRow } from '../context';
import type { PanelSpec } from '../panels/specs';
import type { useReportFormats } from '../use-report-formats';
import type { calculateTotals } from './utils';

type Inputs = {
	totals: ReturnType<typeof calculateTotals>;
	orders: number;
	periodRefunds?: RefundRow[];
	registerNames: Record<string, string>;
	cashierNames: Record<string, string>;
	num_decimals?: number;
};
export function summarySpec(
	{ totals, orders, periodRefunds, registerNames, cashierNames, num_decimals }: Inputs,
	t: (key: string) => string,
	{
		money,
		number,
		quantity,
	}: Pick<ReturnType<typeof useReportFormats>, 'money' | 'number' | 'quantity'>
): PanelSpec {
	const row = (key: string, label: string, count: number | '' = '', amount: number | '' = '') => ({
		key,
		raw: [label, count, amount],
		cells: [label, count === '' ? '' : number(count), amount === '' ? '' : money(amount)],
	});
	const groups: NonNullable<PanelSpec['groups']> = [];
	const group = (
		key: string,
		label: string,
		rows: PanelSpec['rows'],
		subtotal: ReturnType<typeof row>
	) => {
		groups.push({ key, label, rows, total: subtotal.cells, totalRaw: subtotal.raw });
	};
	const totalLabel = t('reports.total_sales_line');
	const refunded =
		periodRefunds === undefined
			? totals.refundTotal
			: refundsSummary(periodRefunds, totals, num_decimals).refunded;
	group(
		'sales',
		t('reports.sales'),
		[
			row('orders', t('common.orders'), orders),
			row('net', t('reports.net_sales'), '', totals.total - totals.totalTax),
			row('tax', t('common.tax'), '', totals.totalTax),
			...(refunded > 0
				? [row('refunds', t('reports.refunded'), periodRefunds?.length ?? '', -refunded)]
				: []),
			row('discounts', t('reports.discounts'), '', totals.discountTotal),
		],
		row('total', totalLabel, '', totals.total)
	);
	group(
		'payments',
		t('reports.payment_methods'),
		totals.paymentMethodsArray.map((method) =>
			row(
				method.payment_method,
				method.payment_method === 'unpaid'
					? t('reports.unpaid')
					: method.payment_method === 'unknown'
						? t('common.unknown')
						: method.payment_method_title,
				'',
				method.total
			)
		),
		row('total', t('reports.taken'), '', sumBy(totals.paymentMethodsArray, 'total'))
	);
	if (totals.taxTotalsArray.length)
		group(
			'taxes',
			t('common.taxes'),
			totals.taxTotalsArray.map((tax) => row(String(tax.rate_id), tax.label, '', tax.total)),
			row('total', t('reports.tax_collected'), '', totals.totalTax)
		);
	if (totals.shippingTotalsArray.length)
		group(
			'shipping',
			t('common.shipping'),
			totals.shippingTotalsArray.map((method) =>
				row(method.method_id, method.method_id, '', method.total)
			),
			row('total', t('common.total'), '', sumBy(totals.shippingTotalsArray, 'total'))
		);
	if (totals.registerArray.length > 1)
		group(
			'registers',
			t('reports.panel_registers'),
			totals.registerArray.map((register) =>
				row(
					register.registerId,
					registerNames[register.registerId] || register.registerId.slice(0, 8),
					register.totalOrders,
					register.totalAmount
				)
			),
			row(
				'total',
				t('common.total'),
				sumBy(totals.registerArray, 'totalOrders'),
				sumBy(totals.registerArray, 'totalAmount')
			)
		);
	if (totals.userStoreArray.length > 1)
		group(
			'cashiers',
			t('reports.panel_cashiers'),
			totals.userStoreArray.map((cashier, i) =>
				row(
					String(i),
					cashierNames[cashier.cashierId] || t('common.unknown'),
					cashier.totalOrders,
					cashier.totalAmount
				)
			),
			row(
				'total',
				t('common.total'),
				sumBy(totals.userStoreArray, 'totalOrders'),
				sumBy(totals.userStoreArray, 'totalAmount')
			)
		);
	const items = row('items', t('reports.items_sold_line'), totals.totalItemsSold);
	items.cells[1] = quantity(totals.totalItemsSold);
	group(
		'orders',
		t('common.orders'),
		[items, row('average', t('reports.average_order_line'), '', totals.averageOrderValue)],
		row('total', '')
	);
	const total = row('total', totalLabel, orders, totals.total);
	return {
		head: [t('reports.col_line'), t('reports.col_count'), t('common.amount')],
		keys: ['line', 'count', 'amount'],
		types: ['text', 'number', 'money'],
		align: ['left', 'right', 'right'],
		rows: [],
		groups,
		total: total.cells,
		totalRaw: total.raw,
	};
}
