import { from, combineLatest, Observable } from 'rxjs';
import { switchMap, map, tap } from 'rxjs/operators';
import isFinite from 'lodash/isFinite';

type LineItemDocument = import('../../').LineItemDocument;

/**
 * WooCommerce Order Line Item methods
 */
export default {
	/**
	 *
	 */
	computedTotal$(this: LineItemDocument) {
		return combineLatest([this.quantity$, this.price$]).pipe(
			map(([quantity = 0, price = 0]) => String(quantity * price)),
			tap((total: string) => {
				if (total !== this.total) this.atomicPatch({ total });
			})
		);
	},

	/**
	 *
	 */
	// computedSubtotal(this: LineItemDocument) {
	// 	return this.get('quantity') * this.get('price');
	// },
};
