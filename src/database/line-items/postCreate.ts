import { from, combineLatest } from 'rxjs';
import { switchMap, map, tap } from 'rxjs/operators';
import isFinite from 'lodash/isFinite';

type OrderLineItemDocument = import('../../../types').OrderLineItemDocument;

/**
 * Calculate quantity * price
 * @TODO - question: is it possible to hook in before qty or price
 * changes and then emit with updated total?
 */
export default (plainData: Record<string, unknown>, model: OrderLineItemDocument) => {
	combineLatest([model.quantity$, model.price$])
		.pipe(tap((res) => console.log(res)))
		.subscribe((val) => {
			const quantity = isFinite(val[0]) ? (val[0] as number) : 0;
			const price = isFinite(val[1]) ? (val[1] as number) : 0;
			const total = quantity * price;
			model.atomicPatch({ total: String(total) });
		});
};
