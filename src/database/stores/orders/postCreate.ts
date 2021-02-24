import { from, of, combineLatest } from 'rxjs';
import { switchMap, tap, catchError, map, filter } from 'rxjs/operators';
import sumBy from 'lodash/sumBy';

type OrderDocument = import('../../types').OrderDocument;
type OrderLineItemDocument = import('../../types').OrderLineItemDocument;

/**
 * wire up total
 */
export default (plainData: Record<string, unknown>, rxDocument: OrderDocument) => {
	// combineLatest(rxDocument.quantity$, rxDocument.price$).subscribe((val) => {
	// 	rxDocument.atomicSet('total', String(val[0] * val[1]));
	// });

	// @TODO - why does this effect line_item subscriptions?
	rxDocument.line_items$
		.pipe(
			switchMap((ids: string[]) => {
				return from(rxDocument.collections().line_items.findByIds(ids || []));
			}),
			// map((result) => Array.from(result.values())),
			// switchMap((array) => combineLatest(array.map((item) => item.$))),
			switchMap((items: Map<string, OrderLineItemDocument>) => {
				return combineLatest(Array.from(items.values()).map((item) => item.$));
			}),
			catchError((err) => {
				console.error(err);
				return err;
			})
		)
		.subscribe((lineItems: OrderLineItemDocument[]) => {
			const totalAsNumber = sumBy(lineItems, (item) => Number(item.total));
			const total = String(totalAsNumber);
			if (total !== rxDocument.total) {
				rxDocument.atomicPatch({ total });
			}

			const totalTaxAsNumber = sumBy(lineItems, (item) => Number(item.total_tax));
			const total_tax = String(totalTaxAsNumber);
			if (total_tax !== rxDocument.total_tax) {
				rxDocument.atomicPatch({ total_tax });
			}
		});
};
