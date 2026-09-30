import round from 'lodash/round';

import { wooMetaCarrier } from '@wcpos/sync-core';

import { refundsSummary } from '../cards/aggregate';
import { chainLabel, cogsEnabled, lineCost, marginOf } from '../margin';

import type { brands, CategoryTree } from '../margin';
import type { cashiers, categories, taxesByRate, tenders, topProducts } from '../cards/aggregate';
import type { DetailId, RefundRow, ReportOrder } from '../context';
import type { calculateTotals } from '../report/utils';
import type { useReportFormats } from '../use-report-formats';

export type PanelSpec = {
	missing?: { n: number; m: number };
	head: string[];
	rows: { key: string | number; cells: string[]; raw: (string | number)[] }[];
	keys: string[];
	types: ('text' | 'number' | 'money')[];
	totalRaw: (string | number)[];
	total: string[];
	align: ('left' | 'right')[];
};
type Inputs = {
	periodRefunds?: RefundRow[];
	brands?: ReturnType<typeof brands>;
	categoryTree?: CategoryTree;
	cogs?: boolean;
	num_decimals?: number;
	payments: ReturnType<typeof tenders>;
	products: ReturnType<typeof topProducts>;
	categories: ReturnType<typeof categories>;
	cashiers: ReturnType<typeof cashiers>;
	taxes: ReturnType<typeof taxesByRate>;
	orders: ReportOrder[];
	unselectedRowIds?: Record<string, boolean>;
	orderTime?: (order: Pick<ReportOrder, 'date_created_gmt'>) => string;
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
		brands: ['brand', 'qty', 'amount', 'share'],
		cashiers: ['cashier', 'orders', 'avg_order', 'amount'],
		taxes: ['rate', 'net', 'tax', 'gross'],
		refunds: ['order', 'time', 'reason', 'amount'],
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
	): PanelSpec => {
		const result: PanelSpec = {
			head: head.map((key) => t(key)),
			rows,
			total,
			totalRaw,
			keys,
			types,
			align: keys.map((key, index) =>
				index === 0 || (types[index] === 'text' && key !== 'share') ? 'left' : 'right'
			),
		};
		const groups =
			id === 'products'
				? products
				: id === 'categories'
					? categories.parts
					: id === 'brands'
						? (inputs.brands?.parts ?? [])
						: null;
		if (groups && (inputs.cogs ?? cogsEnabled(orders, []))) {
			const insert = <T>(values: T[], extra: T[]) => values.splice(3, 0, ...extra);
			insert(result.keys, ['cost', 'profit', 'margin']);
			insert(
				result.head,
				['reports.col_cost', 'reports.col_profit', 'reports.col_margin'].map((key) => t(key))
			);
			insert(result.types, ['money', 'money', 'number']);
			insert(result.align, ['right', 'right', 'right']);
			const append = (
				cells: string[],
				raw: (string | number)[],
				value: ReturnType<typeof marginOf>,
				known: boolean
			) => {
				insert(cells, [
					known ? money(value.cost) : '—',
					known ? money(value.profit) : '—',
					value.marginPct === null ? '—' : share(value.marginPct),
				]);
				insert(raw, [
					known ? value.cost : '',
					known ? value.profit : '',
					value.marginPct === null ? '' : value.marginPct * 100,
				]);
				return value;
			};
			const value = marginOf([]),
				known = groups.some((group) => (group.lines ?? []).some((line) => lineCost(line) !== null));
			groups.forEach((group, index) => {
				const lines = group.lines ?? [],
					row = marginOf(lines, inputs.num_decimals);
				append(rows[index].cells, rows[index].raw, row, row.missing < lines.length);
				for (const key of ['net', 'cost', 'profit', 'missing', 'items', 'missingItems'] as const)
					value[key] += row[key];
			});
			value.cost = round(value.cost, inputs.num_decimals ?? 2);
			value.profit = round(value.profit, inputs.num_decimals ?? 2);
			value.marginPct =
				value.cost + value.profit ? value.profit / (value.cost + value.profit) : null;
			append(total, totalRaw, value, known);
			if (value.missing) result.missing = { n: value.missingItems, m: value.items };
		}
		return result;
	};

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
					quantity(products.reduce((sum, row) => sum + row.quantity, 0)),
					money(products.reduce((sum, row) => sum + row.amount, 0)),
				],
				[
					t('reports.all_products'),
					products.reduce((sum, row) => sum + row.quantity, 0),
					products.reduce((sum, row) => sum + row.amount, 0),
				]
			);
		case 'brands':
		case 'categories': {
			const grouping = id === 'brands' ? (inputs.brands?.parts ?? []) : categories.parts;
			const label = (row: (typeof categories.parts)[number]) =>
				(id === 'categories' && inputs.categoryTree
					? chainLabel(Number(row.key), inputs.categoryTree, t('reports.chain_separator'), unknown)
					: '') ||
				row.label ||
				labels[row.key] ||
				unknown;
			const labels: Record<string, string> = {
				unknown: t('reports.unknown_product'),
				uncategorised: t('reports.uncategorised'),
				nobrand: t('reports.no_brand'),
			};
			return spec(
				[
					id === 'brands' ? 'common.brand' : 'common.category',
					'reports.col_qty',
					'common.amount',
					'reports.col_share',
				],
				grouping.map((row) => ({
					key: row.key,
					raw: [label(row), row.quantity, row.amount, row.share * 100],
					cells: [label(row), quantity(row.quantity), money(row.amount), share(row.share)],
				})),
				[
					total,
					quantity(grouping.reduce((sum, row) => sum + row.quantity, 0)),
					money(grouping.reduce((sum, row) => sum + row.amount, 0)),
					'',
				],
				[
					total,
					grouping.reduce((sum, row) => sum + row.quantity, 0),
					grouping.reduce((sum, row) => sum + row.amount, 0),
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
		case 'refunds': {
			const refunds = inputs.periodRefunds ?? [];
			const refunded = refundsSummary(refunds, totals, inputs.num_decimals).refunded;
			return spec(
				['common.order', 'reports.col_time', 'reports.col_reason', 'common.amount'],
				refunds.map((refund) => {
					const amount = Math.abs(Number(refund.amount ?? refund.total ?? 0));
					const cells = [
						`#${refund.parentNumber || orders.find((order) => order.id === refund.parent_id)?.number || refund.parent_id}`,
						inputs.orderTime?.(refund) || unknown,
						refund.reason || '—',
						money(amount),
					];
					return { key: refund.id, cells, raw: [cells[0], cells[1], cells[2], amount] };
				}),
				[t('reports.refunded'), '', '', money(refunded)],
				[t('reports.refunded'), '', '', refunded]
			);
		}
	}
}
