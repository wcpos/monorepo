import { from, combineLatest, Observable } from 'rxjs';
import { switchMap, map, tap } from 'rxjs/operators';
import isFinite from 'lodash/isFinite';

type LineItemCollection = import('./line-items').LineItemCollection;
type LineItemDocument = import('./line-items').LineItemDocument;

/**
 *
 */
export function postCreate(
	this: LineItemCollection,
	plainData: Record<string, unknown>,
	lineItem: LineItemDocument
) {
	/**
	 * Calculate quantity * price
	 * @TODO - question: is it possible to hook in before qty or price
	 * changes and then emit with updated total?
	 */
	combineLatest<{
		quantity: Observable<number | undefined>;
		price: Observable<number | undefined>;
	}>({
		quantity: lineItem.quantity$,
		price: lineItem.price$,
	}).subscribe(({ quantity = 0, price = 0 }) => {
		const total = quantity * price;
		lineItem.atomicPatch({ total: String(total) });
	});
}
