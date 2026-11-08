import sumBy from 'lodash/sumBy';

import { tenderLabel } from '../cards/aggregate';

import type { PanelSpec } from '../panels/specs';
import type { useReportFormats } from '../use-report-formats';
import type { SalesFigures } from './sales-figures';

type Inputs = {
	figures: SalesFigures;
	registerNames: Record<string, string>;
	cashierNames: Record<string, string>;
	/** Under All stores: the store names, and the period prints by store in place of registers. */
	storeNames?: Record<string, string>;
};
export function summarySpec(
	{ figures, registerNames, cashierNames, storeNames }: Inputs,
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
	const payments = figures.takenByTender;
	const stores = storeNames && figures.byStore;
	const refunded =
		figures.refundRows === undefined ? figures.embeddedRefunds : figures.refunds.refunded;
	group(
		'sales',
		t('reports.sales'),
		[
			row('orders', t('common.orders'), figures.count),
			row('net', t('reports.net_sales'), '', figures.net),
			row('tax', t('common.tax'), '', figures.tax),
			...(refunded > 0
				? [row('refunds', t('reports.refunded'), figures.refundRows?.length ?? '', -refunded)]
				: []),
			row('discounts', t('reports.discounts'), '', figures.discounts),
		],
		row('total', totalLabel, '', figures.gross)
	);
	group(
		'payments',
		t('reports.payment_methods'),
		payments.map((tender) => row(tender.key, tenderLabel(tender, t), '', tender.amount)),
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
	if (figures.taxLines.length)
		group(
			'taxes',
			t('common.taxes'),
			figures.taxLines.map((tax) => row(String(tax.rate_id), tax.label, '', tax.total)),
			row('total', t('reports.tax_collected'), '', figures.tax)
		);
	if (figures.shipping.length)
		group(
			'shipping',
			t('common.shipping'),
			figures.shipping.map((method) => row(method.method_id, method.method_id, '', method.total)),
			row('total', t('common.total'), '', sumBy(figures.shipping, 'total'))
		);
	if (stores)
		group(
			'stores',
			t('reports.panel_stores'),
			stores.map((store) =>
				row(
					store.key,
					store.key === 'online'
						? t('common.online')
						: store.key === 'unassigned'
							? t('reports.no_store_row')
							: storeNames[store.key] || t('common.unknown'),
					store.orders,
					store.amount
				)
			),
			row('total', t('common.total'), sumBy(stores, 'orders'), sumBy(stores, 'amount'))
		);
	else if (figures.registersStamped.length > 1)
		group(
			'registers',
			t('reports.panel_registers'),
			figures.registersStamped.map((register) =>
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
				sumBy(figures.registersStamped, 'totalOrders'),
				sumBy(figures.registersStamped, 'totalAmount')
			)
		);
	if (figures.byCashierAndStore.length > 1)
		group(
			'cashiers',
			t('reports.panel_cashiers'),
			figures.byCashierAndStore.map((cashier, i) =>
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
				sumBy(figures.byCashierAndStore, 'totalOrders'),
				sumBy(figures.byCashierAndStore, 'totalAmount')
			)
		);
	const items = row('items', t('reports.items_sold_line'), figures.items);
	items.cells[1] = quantity(figures.items);
	group(
		'orders',
		t('common.orders'),
		[items, row('average', t('reports.average_order_line'), '', figures.average)],
		row('total', '')
	);
	const total = row('total', totalLabel, figures.count, figures.gross);
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
