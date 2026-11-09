import {
	cashiers,
	categories,
	channels,
	ordersSummary,
	refundsSummary,
	registers,
	stores,
	taxesByRate,
	tenders,
	topProducts,
} from '../cards/aggregate';
import { brands, cogsEnabled, lineCost, topLevelOf } from '../margin';
import { calculateTotals } from './utils';

import type { LocalProduct } from '../cards/aggregate';
import type { RefundRow, ReportOrder } from '../context';
import type { CategoryTree } from '../margin';

/** Each thunk is read as a property, `figures.gross`, and computed only when read. */
const named = <P extends object, T extends Record<string, () => unknown>>(thunks: T, plain: P) =>
	Object.defineProperties(
		plain,
		Object.fromEntries(Object.entries(thunks).map(([key, get]) => [key, { get, enumerable: true }]))
	) as P & { readonly [K in keyof T]: ReturnType<T[K]> };

/**
 * The period's sales figures: the one module the cards, the detail panels and the printed
 * summary read, built once per selection in the reports data.
 *
 * Every figure is named. Where two surfaces show different figures for one idea, the difference
 * is the name each reads: the hero reads `gross`, the Top products card and its panel
 * `products.netOfRefunds` (ledger 35, 36: the hero stays gross, margin nets refunds), so making two
 * surfaces agree, or differ, is changing the name one of them reads. The arithmetic stays in `calculateTotals`,
 * `cards/aggregate.ts` and `margin.ts`.
 */
export function salesFigures(
	{
		orders,
		refunds,
		decimals,
	}: {
		orders: ReportOrder[];
		/** The room's period refunds; undefined until the refunds read answers. */
		refunds?: RefundRow[];
		decimals?: number;
	},
	answers = new Map<string, { args: unknown[]; value: unknown }>()
) {
	// What reads no refunds is kept in `answers`, which `withRefunds` shares with its figures; the
	// answer is kept for the arguments it was last asked with (a product directory).
	const kept =
		<A extends unknown[], T>(key: string, compute: (...args: A) => T) =>
		(...args: A): T => {
			const last = answers.get(key);
			if (last?.args.length === args.length && last.args.every((arg, i) => arg === args[i]))
				return last.value as T;
			const value = compute(...args);
			answers.set(key, { args, value });
			return value;
		};
	const totals = kept('totals', () => calculateTotals({ orders, num_decimals: decimals }));
	let refunded: ReturnType<typeof refundsSummary> | undefined;
	return named(
		{
			gross: () => totals().total,
			/** Gross less tax, unrounded: the printed Sales group (the Taxes card and panel round). */
			net: () => totals().total - totals().totalTax,
			tax: () => totals().totalTax,
			discounts: () => totals().discountTotal,
			items: () => totals().totalItemsSold,
			average: () => totals().averageOrderValue,
			orderStats: kept('orderStats', () => ordersSummary(orders, totals(), decimals)),
			/** The payment ledger's tenders: the Payments card, panel and printed Payment methods. */
			takenByTender: kept('takenByTender', () => tenders(orders, totals(), decimals)),
			/** By cashier across stores: the Cashiers card and panel, the printed Cashiers group. */
			byCashier: kept('byCashier', () => cashiers(totals())),
			/** By register, with the online and no-register remainders: Where sold, its panel, the paper. */
			byRegister: kept('byRegister', () => registers(orders, totals())),
			/** Only what a register stamped: whether there is more than one register to show. */
			registersStamped: () => totals().registerArray,
			byStore: kept('byStore', () => stores(orders, totals())),
			byChannel: kept('byChannel', () => channels(orders, totals())),
			/** Rates with the net each taxed, rounded: the Taxes card and panel, the printed Taxes group. */
			taxesByRate: kept('taxesByRate', () => taxesByRate(orders, totals(), decimals)),
			shipping: () => totals().shippingTotalsArray,
			/** The period refunds (ledger 35): the Refunds card and panel, the printed refund row. */
			refunds: () =>
				(refunded ??= refundsSummary(refunds ?? [], totals(), decimals, orders.length)),
			/** The orders' embedded refunds: the printed refund row while the period's are unknown. */
			embeddedRefunds: () => totals().refundTotal,
		},
		{
			decimals,
			count: orders.length,
			refundRows: refunds,
			withRefunds: (rows: RefundRow[]) =>
				salesFigures({ orders, refunds: rows, decimals }, answers),
			products: {
				/** Sale and period refund lines: the Top products card, and the Products panel narrowed by its chips. */
				netOfRefunds: (
					directory?: LocalProduct[],
					lines: ReportOrder[] = orders,
					refundLines: RefundRow[] = refunds ?? []
				) => topProducts(lines, totals(), decimals, refundLines, directory),
			},
			categories: {
				/**
				 * Sale and period refund lines by first category: the panel by the assigned category, the
				 * card (given the `tree`) rolled up its local chain (ledger 33).
				 */
				netOfRefunds: (directory: LocalProduct[] = [], tree?: CategoryTree) =>
					categories(
						orders,
						directory,
						totals(),
						decimals,
						(product) => {
							const category = product.categories?.[0];
							return category?.id && tree?.has(category.id)
								? topLevelOf(category.id, tree)
								: category;
						},
						undefined,
						refunds
					),
			},
			brands: {
				gross: kept('brands', (directory: LocalProduct[] = []) =>
					brands(orders, directory, totals(), decimals)
				),
				netOfRefunds: (directory: LocalProduct[] = []) =>
					brands(orders, directory, totals(), decimals, refunds),
			},
			margin: {
				/** Costs on the sales, their products or a period refund line: the Brands card's slot
				 * (ledger 33) and the grouped panels' margin columns (ledger 36). */
				shownNetOfRefunds: (directory: LocalProduct[] = []) =>
					cogsEnabled(orders, directory) ||
					(refunds ?? []).some((refund) =>
						(refund.line_items ?? []).some((line) => lineCost(line) !== null)
					),
			},
		}
	);
}
export type SalesFigures = ReturnType<typeof salesFigures>;
