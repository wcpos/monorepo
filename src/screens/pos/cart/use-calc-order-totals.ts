import { combineLatest, debounceTime } from 'rxjs';
import { switchMap, tap } from 'rxjs/operators';
import { useSubscription } from 'observable-hooks';
import sumBy from 'lodash/sumBy';
import map from 'lodash/map';
import { calcTaxes, sumTaxes, sumItemizedTaxes } from './utils';

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

const useCalcTotals = (order) => {
	console.log('order calc');

	const lineItemCalc = (lineItem) => {
		return combineLatest([lineItem.quantity$, lineItem.price$]).pipe(
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
		);
	};

	// @TODO - subscribe to order.line_items$ only
	const lineCalc$ = order.cart$.pipe(
		switchMap(({ line_items, fee_lines, shipping_lines }) => {
			return combineLatest(line_items.map((line_item) => lineItemCalc(line_item)));
		})
	);

	const orderCalc$ = order.flattenedCart$.pipe(
		tap((lines) => {
			const total = sumBy(lines, (item) => +(item.total ?? 0));
			const totalTax = sumBy(lines, (item) => +(item.total_tax ?? 0));
			const totalWithTax = total + totalTax;
			const totalTaxString = String(totalTax);
			const totalWithTaxString = String(totalWithTax);
			const itemizedTaxes = sumItemizedTaxes(lines.map((line) => line.taxes ?? []));
			const taxLines = itemizedTaxes.map((tax) => ({
				id: tax.id,
				tax_total: String(tax.total),
			}));

			order.atomicPatch({
				total: totalWithTaxString,
				total_tax: totalTaxString,
				tax_lines: taxLines,
			});
		})
	);

	useSubscription(orderCalc$);
	useSubscription(lineCalc$);
};

export default useCalcTotals;
