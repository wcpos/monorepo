// wcpos/roadmap#332 wp-env proof (2026-09-29): costed lines carry
// cost_of_goods_sold: { value: 25 } (net, already quantity × cost); missing costs
// carry cogs_value: null and no cost_of_goods_sold. Never read cogs_value as zero.
import round from 'lodash/round';

import { categories } from './cards/aggregate';

import type { LocalProduct } from './cards/aggregate';
import type { RefundRow, ReportOrder } from './context';

export type OrderLine = Omit<
	NonNullable<ReportOrder['line_items']>[number],
	'cost_of_goods_sold'
> & {
	cost_of_goods_sold?: { value?: unknown } | null;
};
export function lineCost(line: OrderLine): number | null {
	const value = line.cost_of_goods_sold?.value;
	return typeof value === 'number' && Number.isFinite(value) ? value : null;
}
export function marginOf(lines: OrderLine[], num_decimals = 2) {
	let net = 0,
		cost = 0,
		costedNet = 0,
		missing = 0,
		items = 0,
		missingItems = 0;
	for (const line of lines) {
		const value = lineCost(line),
			quantity = Number.isFinite(line.quantity) ? line.quantity! : 0;
		net += Number(line.total || 0);
		items += Math.abs(quantity);
		if (value === null) {
			missing++;
			missingItems += Math.abs(quantity);
		} else {
			cost += value;
			costedNet += Number(line.total || 0);
		}
	}
	// Partial rows report profit only on lines whose cost is known, never assume free stock.
	const profit = round(costedNet - cost, num_decimals);
	return {
		net: round(net, num_decimals),
		cost: round(cost, num_decimals),
		profit,
		marginPct: costedNet && missing < lines.length ? profit / costedNet : null,
		missing,
		items,
		missingItems,
	};
}
export function cogsEnabled(orders: { cost_of_goods_sold?: unknown }[], products: LocalProduct[]) {
	return [...orders, ...products].some(
		(row) => row.cost_of_goods_sold !== null && typeof row.cost_of_goods_sold === 'object'
	);
}
export type LocalCategory = { id: number; name?: string; parent?: number };
export type CategoryTree = Map<number, LocalCategory>;
function categoryChain(id: number, tree: CategoryTree) {
	const chain: LocalCategory[] = [];
	for (let step = 0; id && step < 10; step++) {
		const node = tree.get(id);
		if (!node) break;
		chain.unshift(node);
		id = node.parent ?? 0;
	}
	return chain;
}
export function topLevelOf(id: number, tree: CategoryTree) {
	const node = categoryChain(id, tree)[0];
	return { id: node?.id ?? id, name: node?.name || '' };
}
export function chainLabel(id: number, tree: CategoryTree, separator: string, unknown = '') {
	return categoryChain(id, tree)
		.map((node) => node.name || unknown)
		.join(separator);
}
export function brands(
	orders: ReportOrder[],
	products: LocalProduct[],
	totals: Parameters<typeof categories>[2],
	num_decimals = 2,
	refunds: RefundRow[] = []
) {
	return categories(
		orders,
		products,
		totals,
		num_decimals,
		(product) => product.brands?.[0],
		'nobrand',
		refunds
	);
}
