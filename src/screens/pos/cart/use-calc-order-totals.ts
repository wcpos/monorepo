import { combineLatest, debounceTime } from 'rxjs';
import { switchMap, tap } from 'rxjs/operators';
import { useSubscription } from 'observable-hooks';
import sumBy from 'lodash/sumBy';
import { sumItemizedTaxes } from './utils';

const useCalcTotals = (order) => {
	const lineItems$ = order.line_items$.pipe(
		switchMap(() => order.populate('line_items'))
		// tap(() => {
		// 	debugger;
		// })
	);
	const feeLines$ = order.fee_lines$.pipe(switchMap(() => order.populate('fee_lines')));
	const shippingLines$ = order.shipping_lines$.pipe(
		switchMap(() => order.populate('shipping_lines'))
	);

	const calc$ = combineLatest([lineItems$, feeLines$, shippingLines$]).pipe(
		debounceTime(100),
		tap(([lineItems = [], feeLines = [], shippingLines = []]) => {
			const lines = lineItems.concat(feeLines, shippingLines);
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

			if (totalWithTaxString !== order.total || totalTaxString !== order.total_tax) {
				order.atomicPatch({
					total: totalWithTaxString,
					total_tax: totalTaxString,
					tax_lines: taxLines,
				});
			}
		})
	);

	useSubscription(calc$);
};

export default useCalcTotals;
