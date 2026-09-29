import { wooMetaCarrier } from '@wcpos/sync-core';

import type { cashiers, categories, taxesByRate, tenders, topProducts } from '../cards/aggregate';
import type { DetailId, ReportOrder } from '../context';
import type { calculateTotals } from '../report/utils';
import type { useReportFormats } from '../use-report-formats';

export type PanelSpec = {
	head: string[];
	rows: { key: string | number; cells: string[]; raw: (string | number)[] }[];
	keys: string[];
	types: ('text' | 'number' | 'money')[];
	totalRaw: (string | number)[];
	total: string[];
	align: ('left' | 'right')[];
};
type Inputs = {
	payments: ReturnType<typeof tenders>;
	products: ReturnType<typeof topProducts>;
	categories: ReturnType<typeof categories>;
	cashiers: ReturnType<typeof cashiers>;
	taxes: ReturnType<typeof taxesByRate>;
	orders: ReportOrder[];
	unselectedRowIds?: Record<string, boolean>;
	orderTime?: (order: ReportOrder) => string;
	totals: ReturnType<typeof calculateTotals>;
	cashierNames: Record<string, string>;
	formats: Pick<ReturnType<typeof useReportFormats>, 'money' | 'number' | 'quantity' | 'percent'>;
	t: (key: string, values?: Record<string, unknown>) => string;
};
export function panelSpec(id: DetailId, inputs: Inputs): PanelSpec {
	const {
		payments,
		products,
		categories,
		cashiers,
		taxes,
		orders,
		totals,
		cashierNames,
		formats,
		t,
	} = inputs;
	const { money, number, quantity, percent } = formats;
	const share = (value: number) => t('reports.percent', { value: percent(value * 100) });
	const unknown = t('common.unknown'),
		total = t('common.total');
	const count = number(orders.length),
		amount = money(totals.total);
	const keys = {
		payments: ['method', 'orders', 'amount', 'share'],
		products: ['product', 'qty', 'amount'],
		categories: ['category', 'qty', 'amount', 'share'],
		cashiers: ['cashier', 'orders', 'avg_order', 'amount'],
		taxes: ['rate', 'net', 'tax', 'gross'],
		refunds: ['order', 'reason', 'amount'],
		orders: ['order', 'time', 'cashier', 'paid_by', 'total', 'counted'],
	}[id];
	const types = keys.map((key): PanelSpec['types'][number] =>
		['amount', 'avg_order', 'net', 'tax', 'gross', 'total'].includes(key)
			? 'money'
			: ['orders', 'qty', 'share'].includes(key)
				? 'number'
				: 'text'
	);
	const spec = (
		head: string[],
		rows: { key: string | number; cells: string[]; raw: (string | number)[] }[],
		total: string[],
		totalRaw: (string | number)[]
	): PanelSpec => ({
		head: head.map((key) => t(key)),
		rows,
		total,
		totalRaw,
		keys,
		types,
		align: keys.map((key, index) =>
			index === 0 || (types[index] === 'text' && key !== 'share') ? 'left' : 'right'
		),
	});
	switch (id) {
		case 'orders':
			return spec(
				[
					'common.order',
					'common.time',
					'common.cashier',
					'reports.col_paid_by',
					'common.total',
					'reports.counted',
				],
				orders.map((order) => {
					const cashier = wooMetaCarrier.readIdentity(order.meta_data).cashierId ?? '';
					const method = order.payment_method
						? order.payment_method_title ||
							(order.payment_method === 'cash' ? t('common.cash') : unknown)
						: order.needs_payment
							? t('reports.unpaid')
							: unknown;
					const cells = [
						order.number ? `#${order.number}` : unknown,
						inputs.orderTime?.(order) || unknown,
						cashierNames[cashier] || unknown,
						method,
						money(Number(order.total || 0)),
						t(inputs.unselectedRowIds?.[order.uuid] ? 'common.no' : 'common.yes'),
					];
					return {
						key: order.uuid,
						cells,
						raw: cells.map((cell, index) =>
							index === 4
								? Number(order.total || 0)
								: index === 5
									? inputs.unselectedRowIds?.[order.uuid]
										? 'no'
										: 'yes'
									: cell
						),
					};
				}),
				[t('reports.counted'), '', '', '', amount, ''],
				[t('reports.counted'), '', '', '', totals.total, '']
			);
		case 'payments': {
			const labels: Record<string, string> = {
				cash: t('common.cash'),
				unpaid: t('reports.unpaid'),
				unknown,
			};
			return spec(
				['reports.col_method', 'common.orders', 'common.amount', 'reports.col_share'],
				payments.map((row) => ({
					key: row.key,
					raw: [row.label || labels[row.key] || unknown, row.orders, row.amount, row.share * 100],
					cells: [
						row.label || labels[row.key] || unknown,
						number(row.orders),
						money(row.amount),
						share(row.share),
					],
				})),
				[total, count, amount, ''],
				[total, orders.length, totals.total, '']
			);
		}
		case 'products':
			return spec(
				['common.product', 'reports.col_qty', 'common.amount'],
				products.map((row) => ({
					key: row.key,
					raw: [row.name || unknown, row.quantity, row.amount],
					cells: [row.name || unknown, quantity(row.quantity), money(row.amount)],
				})),
				// The rows carry line totals; the order total would add shipping and fees they do not.
				[
					t('reports.all_products'),
					quantity(totals.totalItemsSold),
					money(products.reduce((sum, row) => sum + row.amount, 0)),
				],
				[
					t('reports.all_products'),
					totals.totalItemsSold,
					products.reduce((sum, row) => sum + row.amount, 0),
				]
			);
		case 'categories': {
			const labels: Record<string, string> = {
				unknown: t('reports.unknown_product'),
				uncategorised: t('reports.uncategorised'),
			};
			return spec(
				['common.category', 'reports.col_qty', 'common.amount', 'reports.col_share'],
				categories.parts.map((row) => ({
					key: row.key,
					raw: [row.label || labels[row.key] || unknown, row.quantity, row.amount, row.share * 100],
					cells: [
						row.label || labels[row.key] || unknown,
						quantity(row.quantity),
						money(row.amount),
						share(row.share),
					],
				})),
				[
					total,
					quantity(totals.totalItemsSold),
					money(categories.parts.reduce((sum, row) => sum + row.amount, 0)),
					'',
				],
				[
					total,
					totals.totalItemsSold,
					categories.parts.reduce((sum, row) => sum + row.amount, 0),
					'',
				]
			);
		}
		case 'cashiers':
			return spec(
				['common.cashier', 'common.orders', 'reports.col_avg_order', 'common.amount'],
				cashiers.map((row) => ({
					key: row.key,
					raw: [
						cashierNames[row.key] || unknown,
						row.orders,
						row.orders ? row.amount / row.orders : 0,
						row.amount,
					],
					cells: [
						cashierNames[row.key] || unknown,
						number(row.orders),
						money(row.orders ? row.amount / row.orders : 0),
						money(row.amount),
					],
				})),
				[total, count, money(totals.averageOrderValue), amount],
				[total, orders.length, totals.averageOrderValue, totals.total]
			);
		case 'taxes':
			return spec(
				['common.rate', 'reports.document.net', 'common.tax', 'reports.document.gross'],
				taxes.rows.map((row) => ({
					key: row.rateId,
					raw: [
						row.label || unknown,
						row.net ?? '',
						row.tax,
						row.net === null ? '' : row.net + row.tax,
					],
					cells: [
						row.label || unknown,
						row.net === null ? '—' : money(row.net),
						money(row.tax),
						row.net === null ? '—' : money(row.net + row.tax),
					],
				})),
				[total, money(taxes.net), money(taxes.tax), money(taxes.gross)],
				[total, taxes.net, taxes.tax, taxes.gross]
			);
		case 'refunds':
			return {
				...spec(
					['common.order', 'reports.col_reason', 'common.amount'],
					orders.flatMap((order) =>
						(order.refunds ?? []).map((refund, index) => ({
							key: `${order.uuid}-${refund.id ?? index}`,
							raw: [
								order.number ? `#${order.number}` : unknown,
								refund.reason || '—',
								Math.abs(Number(refund.total || 0)),
							],
							cells: [
								order.number ? `#${order.number}` : unknown,
								refund.reason || '—',
								money(Math.abs(Number(refund.total || 0))),
							],
						}))
					),
					[t('reports.refunded'), '', money(totals.refundTotal)],
					[t('reports.refunded'), '', totals.refundTotal]
				),
				align: ['left', 'left', 'right'],
			};
	}
}
