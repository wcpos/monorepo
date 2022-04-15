import { from, of, combineLatest, distinctUntilChanged } from 'rxjs';
import { switchMap, tap, catchError, map, debounceTime, shareReplay } from 'rxjs/operators';
import { ObservableResource } from 'observable-hooks';
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
		switchMap(() => order.populate('line_items')),
		map((line_items) => line_items || []),
		distinctUntilChanged((prev, curr) => {
			return isEqual(
				prev.map((doc) => doc._id),
				curr.map((doc) => doc._id)
			);
		})
	);
	const feeLines$ = order.fee_lines$.pipe(
		switchMap(() => order.populate('fee_lines')),
		map((fee_lines) => fee_lines || []),
		distinctUntilChanged((prev, curr) => {
			return isEqual(
				prev.map((doc) => doc._id),
				curr.map((doc) => doc._id)
			);
		})
	);
	const shippingLines$ = order.shipping_lines$.pipe(
		switchMap(() => order.populate('shipping_lines')),
		map((shipping_lines) => shipping_lines || []),
		distinctUntilChanged((prev, curr) => {
			return isEqual(
				prev.map((doc) => doc._id),
				curr.map((doc) => doc._id)
			);
		})
	);

	/**
	 * Outputs { line_items: [], fee_lines: [], shipping_lines: [] }
	 */
	const cart$ = combineLatest([lineItems$, feeLines$, shippingLines$]).pipe(
		map(([line_items, fee_lines, shipping_lines]) => ({
			line_items,
			fee_lines,
			shipping_lines,
		})),
		tap((args) => {
			console.log('postCreate', args);
			// debugger;
		}),
		shareReplay(1) // cart$ is subscribed to in multiple places
	);

	/**
	 * Outputs [line, line, line, ...]
	 */
	const flattenedCart$ = cart$.pipe(map((lines) => flatten(Object.values(lines))));

	Object.assign(order, { cart$, flattenedCart$ });
}

export default postCreate;
