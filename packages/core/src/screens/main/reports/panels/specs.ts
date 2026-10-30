import round from 'lodash/round';

import { wooMetaCarrier } from '@wcpos/sync-core';

import { refundsSummary } from '../cards/aggregate';
import { chainLabel, cogsEnabled, lineCost, marginOf } from '../margin';

import type { brands, CategoryTree } from '../margin';
import type {
	cashiers,
	categories,
	channels,
	registers,
	taxesByRate,
	tenders,
	topProducts,
} from '../cards/aggregate';
import type { DetailId, RefundRow, ReportOrder } from '../context';
import type { calculateTotals } from '../report/utils';
import type { useReportFormats } from '../use-report-formats';

export type PanelSpec = {
	groups?: {
		key: string;
		label: string;
		rows: PanelSpec['rows'];
		total: string[];
		totalRaw: (string | number)[];
	}[];
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
	channels: ReturnType<typeof channels>;
	registers: ReturnType<typeof registers>;
	registerNames: Record<string, string>;
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
	// Column heads as literal translation calls: the string extractor reads no computed key.
	const col = {
		order: t('common.order'),
		time: t('common.time'),
		cashier: t('common.cashier'),
		paidBy: t('reports.col_paid_by'),
		counted: t('reports.counted'),
		method: t('reports.col_method'),
		orders: t('common.orders'),
		amount: t('common.amount'),
		share: t('reports.col_share'),
		product: t('common.product'),
		qty: t('reports.col_qty'),
		brand: t('common.brand'),
		category: t('common.category'),
		channel: t('common.channel'),
		register: t('common.register'),
		avgOrder: t('reports.col_avg_order'),
		rate: t('common.rate'),
		net: t('reports.document.net'),
		tax: t('common.tax'),
		gross: t('reports.document.gross'),
		refundTime: t('reports.col_time'),
		reason: t('reports.col_reason'),
		cost: t('reports.col_cost'),
		profit: t('reports.col_profit'),
		margin: t('reports.col_margin'),
	};
	const keys = {
		channels: ['channel', 'orders', 'amount', 'share'],
		registers: ['register', 'orders', 'avg_order', 'amount'],
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
			head,
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
			insert(result.head, [col.cost, col.profit, col.margin]);
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
				[col.order, col.time, col.cashier, col.paidBy, total, col.counted],
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
						inputs.unselectedRowIds?.[order.uuid] ? t('common.no') : t('common.yes'),
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
				[col.method, col.orders, col.amount, col.share],
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
				[col.product, col.qty, col.amount],
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
				[id === 'brands' ? col.brand : col.category, col.qty, col.amount, col.share],
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
		case 'channels':
		case 'registers': {
			const byChannel = id === 'channels';
			const rows = byChannel ? inputs.channels : inputs.registers;
			const n = rows.reduce((sum, row) => sum + row.orders, 0);
			const sum = rows.reduce((sum, row) => sum + row.amount, 0);
			const totalShare = rows.reduce((sum, row) => sum + row.share, 0);
			return spec(
				byChannel
					? [col.channel, col.orders, col.amount, col.share]
					: [col.register, col.orders, col.avgOrder, col.amount],
				rows.map((row) => {
					const name = byChannel
						? row.key === 'store'
							? t('reports.in_store')
							: t('common.online')
						: row.key === 'online'
							? t('common.online')
							: row.key === 'unregistered'
								? t('reports.no_register_row')
								: inputs.registerNames[row.key] || unknown;
					const average = row.orders ? row.amount / row.orders : 0;
					return {
						key: row.key,
						raw: byChannel
							? [name, row.orders, row.amount, row.share * 100]
							: [name, row.orders, average, row.amount],
						cells: byChannel
							? [name, number(row.orders), money(row.amount), share(row.share)]
							: [name, number(row.orders), money(average), money(row.amount)],
					};
				}),
				byChannel
					? [total, number(n), money(sum), share(totalShare)]
					: [total, number(n), money(n ? sum / n : 0), money(sum)],
				byChannel ? [total, n, sum, totalShare * 100] : [total, n, n ? sum / n : 0, sum]
			);
		}
		case 'cashiers':
			return spec(
				[col.cashier, col.orders, col.avgOrder, col.amount],
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
				[col.rate, col.net, col.tax, col.gross],
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
				[col.order, col.refundTime, col.reason, col.amount],
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
