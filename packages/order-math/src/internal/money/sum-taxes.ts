import flatten from 'lodash/flatten';
import groupBy from 'lodash/groupBy';
import map from 'lodash/map';
import sumBy from 'lodash/sumBy';
import toNumber from 'lodash/toNumber';

import { getRoundingPrecision, roundHalfUp, roundTaxTotal } from './precision';

type ItemizedTax = { id: number; total: number; [key: string]: any };

/**
 *
 */
export function sumTaxes({ taxes }: { taxes: { total: number; [key: string]: any }[] }) {
	const sum = sumBy(taxes, (tax) => tax.total);
	return sum;
}

/**
 *
 */
export function sumItemizedTaxes({ taxes }: { taxes: (ItemizedTax | ItemizedTax[])[] }) {
	// group taxes by id
	const groupedTaxes = groupBy(flatten(taxes), 'id');
	return map(groupedTaxes, (itemized, id) => ({
		id: toNumber(id), // groupBy converts the key to a string
		total: sumTaxes({ taxes: itemized }),
	}));
}

/**
 * A line's `total_tax` / `subtotal_tax`, derived from its STORED per-rate array.
 *
 * WooCommerce never sums the raw tax. `set_taxes()` first formats every per-rate value
 * to storage precision, and only then aggregates the FORMATTED array:
 *
 *     $tax_data['total'] = array_map( 'wc_format_decimal', $total );   // storage precision
 *     $this->set_prop( 'taxes', $tax_data );
 *     if ( 'yes' === get_option( 'woocommerce_tax_round_at_subtotal' ) ) {
 *         $this->set_total_tax( array_sum( $tax_data['total'] ) );
 *     } else {
 *         $this->set_total_tax( array_sum( array_map( 'wc_round_tax_total', $tax_data['total'] ) ) );
 *     }
 *
 * Both branches read `$tax_data['total']` — the stored array — so the rule is the same
 * either way: ROUND EACH RATE FIRST, THEN SUM. This package used to round the raw
 * multi-rate total instead, which is `round(a + b)` against WooCommerce's
 * `round(a) + round(b)`. On a single-rate store the two agree and nothing shows. On a
 * two-rate store they part company by a microunit whenever the raw sum sits on a
 * boundary — measured on dev-pro 2026-08-24, a fee whose rates give 0.089127 and
 * 0.019608: the till sent `total_tax` 0.108734 where the store stored 0.108735, and
 * every such sale raised the totals-changed banner.
 *
 * That microunit was previously read as an unavoidable PHP-float-vs-decimal tie and
 * written into `expectTaxParity` as a tolerance. It is not a tie. It is this.
 *
 * @param storedPerRate - Per-rate taxes ALREADY at configured storage precision.
 */
export function sumStoredLineTax(
	storedPerRate: readonly number[],
	dp: number,
	pricesIncludeTax: boolean,
	taxRoundAtSubtotal: boolean
): number {
	const summands = taxRoundAtSubtotal
		? storedPerRate
		: storedPerRate.map((value) => roundTaxTotal(value, dp, pricesIncludeTax));
	const total = summands.reduce((sum, value) => sum + value, 0);
	// `wc_format_decimal( $amount )` with $dp === false renders at rounding precision.
	return roundHalfUp(total, getRoundingPrecision(dp));
}
