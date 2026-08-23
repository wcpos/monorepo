import * as React from 'react';

import { createCartConfig } from '@wcpos/order-math';
import { useDocField } from '@wcpos/query';
import type { CartConfig } from '@wcpos/order-math';

import { useAppState } from '../../../../contexts/app-state';
import { useTaxLocation, useTaxSettings } from '../../contexts/tax-rates';
import { taxClassFromWire, taxClassToWire } from '../../hooks/tax-class';

/**
 * The single assembly point for `@wcpos/order-math`'s `CartConfig`.
 *
 * Every cart calculation — the settlement pass and each individual line mutation —
 * has to hand the engine the same store settings, and each caller hand-rolling the
 * same memo is how this repo ended up with two copies of the line-tax maths in the
 * first place. There is one reader of these settings on the cart path now, and it
 * is this hook.
 *
 * Memoised on the settings themselves, not on render, because `CartConfig` identity
 * is a dependency of the settlement subscription: a fresh object every render would
 * re-arm it on every render.
 */
export const useCartConfig = (): CartConfig => {
	const { rates } = useTaxLocation();
	const {
		allRates,
		shippingTaxClass,
		calcTaxes,
		taxRoundAtSubtotal,
		priceNumDecimals,
		pricesIncludeTax,
	} = useTaxSettings();
	const { store } = useAppState();
	const woocommerceSequential = useDocField(
		store,
		(value) => value.woocommerce_calc_discounts_sequentially
	);
	const legacySequential = useDocField(store, (value) => value.calc_discounts_sequentially);
	const calcDiscountsSequentially = woocommerceSequential === 'yes' || legacySequential === 'yes';

	return React.useMemo(
		() =>
			createCartConfig({
				rates,
				allRates,
				calcTaxes,
				pricesIncludeTax,
				taxRoundAtSubtotal,
				dp: priceNumDecimals,
				// Round-trip, not redundancy: the store spells the standard class '' on the
				// wire, the UI spells it 'standard', and this normalises either spelling to
				// the wire form the engine's rate filter matches on.
				shippingTaxClass: taxClassToWire(taxClassFromWire(shippingTaxClass)),
				calcDiscountsSequentially,
			}),
		[
			allRates,
			calcDiscountsSequentially,
			calcTaxes,
			priceNumDecimals,
			pricesIncludeTax,
			rates,
			shippingTaxClass,
			taxRoundAtSubtotal,
		]
	);
};
