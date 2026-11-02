import find from 'lodash/find';
import uniq from 'lodash/uniq';

import { roundHalfUp } from '../money/precision';

type Tax = { id: number; total: number };

/**
 * Consolidates unique taxes by combining subtotal and total tax values.
 *
 * Per-rate taxes are ALWAYS emitted unrounded, at the configured rounding precision, whatever
 * `taxRoundAtSubtotal` says — see PER_RATE_TAXES_ARE_UNROUNDED. That setting governs
 * `total_tax`/`subtotal_tax` only, and those are rounded by the caller.
 *
 * Moved from use-calculate-line-item-tax-and-totals.ts, which is now deleted.
 */
export const consolidateTaxes = (
	subtotalTaxes: { taxes: Tax[] },
	totalTaxes: { taxes: Tax[] },
	noSubtotal: boolean,
	roundingPrecision: number
) => {
	const uniqueTaxIds = uniq([
		...subtotalTaxes.taxes.map((tax) => tax.id),
		...totalTaxes.taxes.map((tax) => tax.id),
	]);

	return uniqueTaxIds.map((id) => {
		const subtotalTax = find(subtotalTaxes.taxes, { id }) || { total: 0 };
		const totalTax = find(totalTaxes.taxes, { id }) || { total: 0 };

		return {
			id,
			subtotal: noSubtotal
				? ''
				: roundHalfUp(subtotalTax.total, roundingPrecision).toFixed(roundingPrecision),
			total: roundHalfUp(totalTax.total, roundingPrecision).toFixed(roundingPrecision),
		};
	});
};
