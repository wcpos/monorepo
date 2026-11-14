import * as React from 'react';

import { useDocField } from '@wcpos/query';
import type { CartConfig } from '@wcpos/order-math';

import {
	cartConfigForOrder,
	cartConfigFromLocation,
	type OrderPayload,
} from '../commands/cart-config-for-order';
import { useBaseTaxLocation } from '../../hooks/use-base-tax-location';
import { useAppState } from '../../../../contexts/app-state';
import { useExtraData } from '../../contexts/extra-data/use-extra-data';
import { useTaxLocation, useTaxSettings } from '../../contexts/tax-rates';

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
export const useCartConfigInputs = () => {
	const baseLocation = useBaseTaxLocation();
	const { country, state, city, postcode } = baseLocation;
	const {
		allRates,
		shippingTaxClass,
		calcTaxes,
		taxRoundAtSubtotal,
		priceNumDecimals,
		pricesIncludeTax,
	} = useTaxSettings();
	const { store } = useAppState();
	const { extraData } = useExtraData();
	const taxBasedOn = useDocField(store, (value) => value.tax_based_on);
	// `wc/v3 taxes/classes` order — standard first, then the merchant's own classes.
	// This is WooCommerce's own candidate order for resolving the 'inherit' sentinel
	// (`array_merge([''], WC_Tax::get_tax_class_slugs())`); the rate-derived list on
	// `useTaxSettings` is deduped from tax RATES and carries no such order.
	const taxClasses = useDocField(extraData, (value) => value.taxClasses);
	// Keyed on the slugs themselves, not the array's identity: `CartConfig` identity is a
	// dependency of the settlement subscription, so a document read that hands back a
	// fresh array for unchanged content would re-arm it on every render.
	const taxClassSlugsKey = ((taxClasses || []) as { slug: string }[])
		.map((taxClass) => taxClass.slug)
		.join('\u0000');
	const taxClassSlugs = React.useMemo(
		() => (taxClassSlugsKey === '' ? [] : taxClassSlugsKey.split('\u0000')),
		[taxClassSlugsKey]
	);
	const woocommerceSequential = useDocField(
		store,
		(value) => value.woocommerce_calc_discounts_sequentially
	);
	const legacySequential = useDocField(store, (value) => value.calc_discounts_sequentially);
	const calcDiscountsSequentially = woocommerceSequential === 'yes' || legacySequential === 'yes';

	return React.useMemo(
		() => ({
			settings: {
				shippingTaxClass,
				calcTaxes,
				pricesIncludeTax,
				taxRoundAtSubtotal,
				priceNumDecimals,
				taxClassSlugs,
				calcDiscountsSequentially,
				taxBasedOn,
			},
			rates: allRates,
			baseLocation: { country, state, city, postcode },
		}),
		[
			allRates,
			shippingTaxClass,
			calcTaxes,
			pricesIncludeTax,
			taxRoundAtSubtotal,
			priceNumDecimals,
			taxClassSlugs,
			calcDiscountsSequentially,
			taxBasedOn,
			country,
			state,
			city,
			postcode,
		]
	);
};

/** The location provider dedupes cart writes before they reach product tiles. */
export const useCartConfig = (): CartConfig => {
	const { settings, rates } = useCartConfigInputs();
	const { location, vatExempt } = useTaxLocation();
	return React.useMemo(
		() => cartConfigFromLocation(settings, rates, location, vatExempt),
		[settings, rates, location, vatExempt]
	);
};

const CartConfigReaderContext = React.createContext<((order?: OrderPayload) => CartConfig) | null>(
	null
);

/**
 * Session-owned cart config: queued commands keep receiving settings after the
 * component that queued them unmounts. Committed inputs are published after every
 * render; the reader (held by a queued command long after the render that enqueued
 * it) reads them at CALL time, inside the command's slot, never during render.
 */
export function CartConfigProvider({ children }: { children: React.ReactNode }) {
	const inputs = useCartConfigInputs();
	const latest = React.useRef({ inputs });
	React.useLayoutEffect(() => {
		latest.current = { inputs };
	}, [inputs]);
	const read = React.useCallback(
		(order?: OrderPayload) => cartConfigForOrder({ ...latest.current.inputs, order }),
		[]
	);
	return (
		<CartConfigReaderContext.Provider value={read}>{children}</CartConfigReaderContext.Provider>
	);
}

export function useCartConfigReader() {
	const read = React.useContext(CartConfigReaderContext);
	if (!read) throw new Error('useCartConfigReader requires CartConfigProvider');
	return read;
}
