import { useSubscription } from 'observable-hooks';
import { combineLatest } from 'rxjs';
import { tap } from 'rxjs/operators';
import map from 'lodash/map';
import { calcTaxes, sumTaxes, sumItemizedTaxes } from '../utils';

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

const useCalcTotals = (lineItem) => {
	useSubscription(
		combineLatest([lineItem.quantity$, lineItem.price$]).pipe(
			tap(([qty = 0, price = 0]) => {
				const discounts = 0;
				const subtotal = qty * price;
				const subtotalTaxes = calcTaxes(subtotal, rates);
				const itemizedSubTotalTaxes = sumItemizedTaxes(subtotalTaxes);
				const total = subtotal - discounts;
				const totalTaxes = calcTaxes(subtotal, rates);
				const itemizedTotalTaxes = sumItemizedTaxes(totalTaxes);
				// itemizedSubTotalTaxes & itemizedTotalTaxes should be same size
				// is there a case where they are not?
				const taxes = map(itemizedSubTotalTaxes, (obj) => {
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
					subtotal_tax: String(sumTaxes(subtotalTaxes)),
					total: String(total),
					total_tax: String(sumTaxes(totalTaxes)),
					taxes,
				});
			})
		)
	);
};

export default useCalcTotals;
