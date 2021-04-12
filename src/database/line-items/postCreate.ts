import { from, combineLatest } from 'rxjs';
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
	combineLatest([lineItem.quantity$, lineItem.price$])
		.pipe(tap((res) => console.log(res)))
		.subscribe((val) => {
			const quantity = isFinite(val[0]) ? (val[0] as number) : 0;
			const price = isFinite(val[1]) ? (val[1] as number) : 0;
			const total = quantity * price;
			lineItem.atomicPatch({ total: String(total) });
		});
}
