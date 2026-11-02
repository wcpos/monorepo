import * as React from 'react';

import { roundPercent } from './round-percent';
import { type NumberFormatOptions, useNumberFormat } from './use-number-format';

/** Up to the four places WooCommerce stores a rate in; a module constant so `format` is stable. */
const PERCENT_FORMAT: NumberFormatOptions = { decimalScale: 4 };

/**
 * A tax percentage as the cashier reads it: `20.0000` → `20%`, `1.1250` → `1.125%`, with the
 * store's decimal separator. One formatter for every surface that shows a rate (the "Tax based
 * on" panel, the tax rates table), so they never disagree about the same rate.
 */
export function usePercentFormat() {
	const { format } = useNumberFormat(PERCENT_FORMAT);
	return React.useCallback(
		(value: number | string) => {
			const numeric = typeof value === 'string' ? parseFloat(value) : value;
			return `${format(roundPercent(Number.isFinite(numeric) ? numeric : 0))}%`;
		},
		[format]
	);
}
