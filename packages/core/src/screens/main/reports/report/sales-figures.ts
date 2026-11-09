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
 * is the name each reads: the Top products card reads `products.gross`, its panel
 * `products.netOfRefunds` (ledger 35, 36: the hero stays gross, margin nets refunds), so changing
 * what a surface shows is changing the name it reads. The arithmetic stays in `calculateTotals`,
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
			/** By cashier across stores: the Cashiers card and panel. */
			byCashier: kept('byCashier', () => cashiers(totals())),
			/** By cashier and store: the printed Cashiers group. */
			byCashierAndStore: () => totals().userStoreArray,
			/** By register, with the online and no-register remainders: Where sold and its panel. */
			byRegister: kept('byRegister', () => registers(orders, totals())),
			/** Only what a register stamped: the printed Registers group. */
			registersStamped: () => totals().registerArray,
			byStore: kept('byStore', () => stores(orders, totals())),
			byChannel: kept('byChannel', () => channels(orders, totals())),
			/** Rates with the net each taxed, rounded: the Taxes card and panel. */
			taxesByRate: kept('taxesByRate', () => taxesByRate(orders, totals(), decimals)),
			/** Rates as the tax lines carry them, unrounded: the printed Taxes group. */
			taxLines: () => totals().taxTotalsArray,
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
			products: named(
				/** Sale lines only: the Top products card. */
				{ gross: kept('products', () => topProducts(orders, totals(), decimals)) },
				{
					/** Sale and period refund lines: the Products panel, narrowed by its chips. */
					netOfRefunds: (
						directory?: LocalProduct[],
						lines: ReportOrder[] = orders,
						refundLines: RefundRow[] = refunds ?? []
					) => topProducts(lines, totals(), decimals, refundLines, directory),
				}
			),
			categories: {
				/** Sale lines by first category, rolled up its local chain: the card (ledger 33). */
				gross: kept('categories', (directory: LocalProduct[] = [], tree?: CategoryTree) =>
					categories(orders, directory, totals(), decimals, (product) => {
						const category = product.categories?.[0];
						return category?.id && tree?.has(category.id)
							? topLevelOf(category.id, tree)
							: category;
					})
				),
				/** Sale and period refund lines by the assigned category: the panel. */
				netOfRefunds: (directory: LocalProduct[] = []) =>
					categories(orders, directory, totals(), decimals, undefined, undefined, refunds),
			},
			brands: {
				gross: kept('brands', (directory: LocalProduct[] = []) =>
					brands(orders, directory, totals(), decimals)
				),
				netOfRefunds: (directory: LocalProduct[] = []) =>
					brands(orders, directory, totals(), decimals, refunds),
			},
			margin: {
				/** Costs on the sales or their products: the Brands card's slot (ledger 33). */
				shown: (directory: LocalProduct[] = []) => cogsEnabled(orders, directory),
				/** Or on a period refund line: the grouped panels' margin columns (ledger 36). */
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
