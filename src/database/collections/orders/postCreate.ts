import { from, of, combineLatest, distinctUntilChanged } from 'rxjs';
import { switchMap, tap, catchError, map, debounceTime } from 'rxjs/operators';
import flatten from 'lodash/flatten';
import isEqual from 'lodash/isEqual';
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
	const lineItems$ = order.line_items$.pipe(
		distinctUntilChanged(isEqual),
		switchMap(() => order.populate('line_items'))
		// tap(() => {
		// 	debugger;
		// })
	);
	const feeLines$ = order.fee_lines$.pipe(
		distinctUntilChanged(isEqual),
		switchMap(() => order.populate('fee_lines'))
	);
	const shippingLines$ = order.shipping_lines$.pipe(
		distinctUntilChanged(isEqual),
		switchMap(() => order.populate('shipping_lines'))
	);

	/**
	 * Outputs { line_items: [], fee_lines: [], shipping_lines: [] }
	 */
	const cart$ = combineLatest([lineItems$, feeLines$, shippingLines$]).pipe(
		/**
		 * the population promises return at different times
		 * debounce emissions to prevent unneccesary re-renders
		 * @TODO - is there a better way?
		 */
		map(([line_items, fee_lines, shipping_lines]) => ({
			line_items,
			fee_lines,
			shipping_lines,
		}))
	);

	/**
	 * Outputs [line, line, line, ...]
	 */
	const flattenedCart$ = cart$.pipe(map((lines) => flatten(Object.values(lines))));

	Object.assign(order, { cart$, flattenedCart$ });
}

export default postCreate;
