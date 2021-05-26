import { from, of, combineLatest } from 'rxjs';
import { switchMap, tap, catchError, map, debounceTime } from 'rxjs/operators';
import sumBy from 'lodash/sumBy';
import { sumItemizedTaxes } from '../utils';

type OrderDocument = import('./').OrderDocument;
type OrderCollection = import('./').OrderCollection;
type LineItemDocument = import('../line-items').LineItemDocument;

/**
 *
 */
function postCreate(
	this: OrderCollection,
	plainData: Record<string, unknown>,
	order: OrderDocument
) {
	/**
	 *
	 */
	const populatedLineItems$ = order.lineItems$.pipe(
		switchMap(async () => {
			const lineItems = await order.populate('lineItems');
			if (!lineItems) {
				return [];
			}
			// return q ? _orderBy(lineItems, q.sortBy, q.sortDirection) : lineItems;
			return lineItems;
		})
	);

	/**
	 *
	 */
	const populatedFeeLines$ = order.feeLines$.pipe(
		switchMap(async () => {
			const feeLines = await order.populate('feeLines');
			if (!feeLines) {
				return [];
			}
			// return q ? _orderBy(lineItems, q.sortBy, q.sortDirection) : lineItems;
			return feeLines;
		})
	);

	/**
	 *
	 */
	const populatedshippingLines$ = order.shippingLines$.pipe(
		switchMap(async () => {
			const shippingLines = await order.populate('shippingLines');
			if (!shippingLines) {
				return [];
			}
			// return q ? _orderBy(lineItems, q.sortBy, q.sortDirection) : lineItems;
			return shippingLines;
		})
	);

	/**
	 *
	 */
	const cart$ = combineLatest([
		populatedLineItems$,
		populatedFeeLines$,
		populatedshippingLines$,
	]).pipe(
		/**
		 * the population promises return at different times
		 * debounce emissions to prevent unneccesary re-renders
		 * @TODO - is there a better way?
		 */
		// debounceTime(100),
		map((lines) => {
			const [lineItems = [], feeLines = [], shippingLines = []] = lines;
			return lineItems.concat(feeLines, shippingLines);
		})
	);

	/**
	 *
	 */
	cart$
		.pipe(switchMap((lines: LineItemDocument[]) => combineLatest(lines.map((line) => line.$))))
		.subscribe((lines) => {
			const total = sumBy(lines, (item) => +(item.total ?? 0));
			const totalTax = sumBy(lines, (item) => +(item.totalTax ?? 0));
			const totalWithTax = total + totalTax;
			const totalTaxString = String(totalTax);
			const totalWithTaxString = String(totalWithTax);
			const itemizedTaxes = sumItemizedTaxes(lines.map((line) => line.taxes ?? []));
			const taxLines = itemizedTaxes.map((tax) => ({
				id: tax.id,
				taxTotal: String(tax.total),
			}));

			if (totalWithTaxString !== order.total || totalTaxString !== order.totalTax) {
				// @ts-ignore
				order.atomicPatch({ total: totalWithTaxString, totalTax: totalTaxString, taxLines });
			}
		});

	Object.assign(order, { populatedLineItems$, cart$ });
}

export default postCreate;
