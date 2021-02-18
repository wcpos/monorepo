import { from, of, combineLatest } from 'rxjs';
import { switchMap, tap, catchError, map, filter } from 'rxjs/operators';
import sumBy from 'lodash/sumBy';

type OrderDocument = import('../../types').OrderDocument;
type OrderLineItemDocument = import('../../types').OrderLineItemDocument;

/**
 * wire up total
 */
export default (raw: Record<string, unknown>, model: OrderDocument) => {
	// combineLatest(model.quantity$, model.price$).subscribe((val) => {
	// 	model.atomicSet('total', String(val[0] * val[1]));
	// });

	// @TODO - why does this effect line_item subscriptions?
	model.line_items$
		.pipe(
			switchMap((ids: [string]) => from(model.collections().line_items.findByIds(ids))),
			// map((result) => Array.from(result.values())),
			// switchMap((array) => combineLatest(array.map((item) => item.$))),
			switchMap((items: [OrderLineItemDocument]) =>
				combineLatest(Array.from(items.values()).map((item) => item.$))
			),
			catchError((err) => {
				console.error(err);
				return err;
			})
		)
		.subscribe((lineItems: [OrderLineItemDocument]) => {
			const total = String(
				sumBy(lineItems, function (item) {
					return Number(item.total);
				})
			);
			if (total !== model.total) {
				console.log(total);
				model.atomicSet('total', total);
			}

			const total_tax = String(
				sumBy(lineItems, function (item) {
					return Number(item.total_tax);
				})
			);
			if (total_tax !== model.total_tax) {
				console.log(total_tax);
				model.atomicSet('total_tax', total_tax);
			}
		});
};
