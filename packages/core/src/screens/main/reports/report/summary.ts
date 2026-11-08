import sumBy from 'lodash/sumBy';

import { refundsSummary } from '../cards/aggregate';

import type { tenders } from '../cards/aggregate';
import type { RefundRow } from '../context';
import type { PanelSpec } from '../panels/specs';
import type { useReportFormats } from '../use-report-formats';
import type { calculateTotals } from './utils';

type Inputs = {
	totals: ReturnType<typeof calculateTotals>;
	orders: number;
	/** The period's tenders from the payment ledger: the rows the Payments card and panel show. */
	payments: ReturnType<typeof tenders>;
	periodRefunds?: RefundRow[];
	registerNames: Record<string, string>;
	cashierNames: Record<string, string>;
	/** Under All stores: the period by store, in place of registers the bound directory cannot name. */
	stores?: {
		rows: { key: string; orders: number; amount: number }[];
		names: Record<string, string>;
	};
	num_decimals?: number;
};
export function summarySpec(
	{
		totals,
		orders,
		payments,
		periodRefunds,
		registerNames,
		cashierNames,
		stores,
		num_decimals,
	}: Inputs,
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
	const tenderLabels: Record<string, string> = {
		cash: t('common.cash'),
		unpaid: t('reports.unpaid'),
		unknown: t('common.unknown'),
	};
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
		payments.map((tender) =>
			row(
				tender.key,
				tender.label || tenderLabels[tender.key] || t('common.unknown'),
				'',
				tender.amount
			)
		),
		// Taken is money taken: what an order still owes is not in it.
		row(
			'total',
			t('reports.taken'),
			'',
			sumBy(
				payments.filter((tender) => tender.key !== 'unpaid'),
				'amount'
			)
		)
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
	if (stores)
		group(
			'stores',
			t('reports.panel_stores'),
			stores.rows.map((store) =>
				row(
					store.key,
					store.key === 'online'
						? t('common.online')
						: store.key === 'unassigned'
							? t('reports.no_store_row')
							: stores.names[store.key] || t('common.unknown'),
					store.orders,
					store.amount
				)
			),
			row('total', t('common.total'), sumBy(stores.rows, 'orders'), sumBy(stores.rows, 'amount'))
		);
	else if (totals.registerArray.length > 1)
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
