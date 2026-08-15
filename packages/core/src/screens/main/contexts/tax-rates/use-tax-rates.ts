import * as React from 'react';

import { useTaxLocation, useTaxSettings } from './provider';

import type { TaxRatesContextProps } from './provider';

/**
 * The combined tax context: store settings plus the order-resolved location and rates.
 *
 * Subscribes to BOTH halves, so it re-renders whenever the current order's tax location
 * changes. Only reach for it when you genuinely need `rates` / `location` / `taxBasedOn` —
 * if all you want is a store setting (`calcTaxes`, `pricesIncludeTax`, `priceNumDecimals`,
 * `taxRoundAtSubtotal`, `allRates`, `taxClasses`), use `useTaxSettings()` instead and stay
 * out of the cart's render path.
 */
export const useTaxRates = (): TaxRatesContextProps => {
	const settings = useTaxSettings();
	const location = useTaxLocation();

	return React.useMemo(() => ({ ...settings, ...location }), [settings, location]);
};
