import * as React from 'react';

import { useDocField, useRecordField } from '@wcpos/query';
import type { CartConfig } from '@wcpos/order-math';

import { cartConfigForOrder, type OrderPayload } from '../commands/cart-config-for-order';
import { useBaseTaxLocation } from '../../hooks/use-base-tax-location';
import { useCurrentOrderOptional } from '../contexts/current-order/context';
import { useAppState } from '../../../../contexts/app-state';
import { useExtraData } from '../../contexts/extra-data/use-extra-data';
import { useTaxSettings } from '../../contexts/tax-rates';

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
export const useCartConfigForOrder = () => {
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

	return React.useCallback(
		(order?: OrderPayload): CartConfig =>
			cartConfigForOrder({
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
				order,
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

/** Memoised on settlement inputs, not unrelated writes to the current order. */
export const useCartConfig = (): CartConfig => {
	const configForOrder = useCartConfigForOrder();
	const order = useCurrentOrderOptional();
	const billing = useRecordField(order, (record) => record.payload.billing);
	const shipping = useRecordField(order, (record) => record.payload.shipping);
	const meta_data = useRecordField(order, (record) => record.payload.meta_data);
	const hasOrder = Boolean(order);
	return React.useMemo(
		() => configForOrder(hasOrder ? { billing, shipping, meta_data } : undefined),
		[configForOrder, hasOrder, billing, shipping, meta_data]
	);
};
