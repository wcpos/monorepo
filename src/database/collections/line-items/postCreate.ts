import { from, combineLatest, Observable } from 'rxjs';
import { switchMap, map, tap } from 'rxjs/operators';
import _map from 'lodash/map';
import { calcTaxes, sumTaxes, sumItemizedTaxes } from '../utils';

type LineItemCollection = import('./line-items').LineItemCollection;
type LineItemDocument = import('./line-items').LineItemDocument;

const rates: any[] = [
	{
		id: 2,
		country: 'GB',
		rate: '20.0000',
		name: 'VAT',
		priority: 1,
		compound: true,
		shipping: true,
		order: 1,
		class: 'standard',
	},
];

/**
 *
 */
export function postCreate(
	this: LineItemCollection,
	plainData: Record<string, unknown>,
	lineItem: LineItemDocument
) {
	/**
	 * add changes for taxes
	 */
	combineLatest([lineItem.quantity$, lineItem.price$]).subscribe((array) => {
		const [quantity = 0, price = 0] = array;
		const discounts = 0;
		const subtotal = quantity * price;
		const subtotalTaxes = calcTaxes(subtotal, rates);
		const itemizedSubTotalTaxes = sumItemizedTaxes(subtotalTaxes);
		const total = subtotal - discounts;
		const totalTaxes = calcTaxes(subtotal, rates);
		const itemizedTotalTaxes = sumItemizedTaxes(totalTaxes);
		// itemizedSubTotalTaxes & itemizedTotalTaxes should be same size
		// is there a case where they are not?
		const taxes = _map(itemizedSubTotalTaxes, (obj) => {
			const index = itemizedTotalTaxes.findIndex((el) => el.id === obj.id);
			const totalTax = index !== -1 ? itemizedTotalTaxes[index] : { total: 0 };
			return {
				id: obj.id,
				subtotal: String(obj.total ?? 0),
				total: String(totalTax.total ?? 0),
			};
		});

		lineItem.atomicPatch({
			subtotal: String(subtotal),
			subtotalTax: String(sumTaxes(subtotalTaxes)),
			total: String(total),
			totalTax: String(sumTaxes(totalTaxes)),
			taxes,
		});
	});
}
