import { createCartConfig } from '@wcpos/order-math';
import { wooMetaCarrier } from '@wcpos/sync-core';

import { filterTaxRates } from '../../contexts/tax-rates/tax-rates.helpers';
import { INHERIT_TAX_CLASS, taxClassFromWire, taxClassToWire } from '../../hooks/tax-class';

import type {
	TaxBasedOn,
	TaxLocation,
	TaxRateData,
	TaxSettingsContextProps,
} from '../../contexts/tax-rates/provider';
import type { CurrentOrderRecord } from '../contexts/current-order/context';

export type OrderPayload = Partial<CurrentOrderRecord['payload']>;
export interface CartConfigInputs {
	settings: Omit<TaxSettingsContextProps, 'allRates' | 'taxClasses'> & {
		taxClassSlugs: readonly string[];
		calcDiscountsSequentially: boolean;
		taxBasedOn: unknown;
	};
	rates: TaxRateData[];
	baseLocation: { country?: unknown; state?: unknown; city?: unknown; postcode?: unknown };
}
/** Resolve the tax address as `WC_Abstract_Order::get_tax_location()` does. */
export function orderTaxLocation(
	baseLocation: CartConfigInputs['baseLocation'],
	storeTaxBasedOn: unknown,
	order?: OrderPayload
) {
	const override = wooMetaCarrier.taxBasedOnOverride(order?.meta_data);
	const taxBasedOn =
		override === 'base' || override === 'billing' || override === 'shipping'
			? override
			: storeTaxBasedOn;
	let addressUsed: TaxBasedOn = 'base';
	if (order && taxBasedOn !== 'base') {
		if (
			taxBasedOn !== 'billing' &&
			typeof order.shipping?.country === 'string' &&
			order.shipping.country !== ''
		) {
			addressUsed = 'shipping';
		} else if (typeof order.billing?.country === 'string' && order.billing.country !== '') {
			addressUsed = 'billing';
		}
	}
	const address =
		addressUsed === 'base'
			? baseLocation
			: addressUsed === 'billing'
				? order?.billing
				: order?.shipping;
	const location = Object.fromEntries(
		['country', 'state', 'city', 'postcode'].map((key) => {
			const value = address?.[key as keyof typeof address];
			return [key, typeof value === 'string' ? value : ''];
		})
	) as unknown as TaxLocation;
	return { taxBasedOn, location, addressUsed };
}
export function cartConfigForOrder({
	settings,
	rates,
	baseLocation,
	order,
}: CartConfigInputs & { order?: OrderPayload }) {
	const { location } = orderTaxLocation(baseLocation, settings.taxBasedOn, order);
	return cartConfigFromLocation(
		settings,
		rates,
		location,
		!settings.pricesIncludeTax && wooMetaCarrier.vatExempt(order?.meta_data)
	);
}
export function cartConfigFromLocation(
	settings: CartConfigInputs['settings'],
	rates: TaxRateData[],
	location: TaxLocation,
	vatExempt = false
) {
	return createCartConfig({
		vatExempt,
		rates: filterTaxRates(
			rates,
			location.country,
			location.state,
			location.postcode,
			location.city
		),
		allRates: rates,
		calcTaxes: settings.calcTaxes,
		pricesIncludeTax: settings.pricesIncludeTax,
		taxRoundAtSubtotal: settings.taxRoundAtSubtotal,
		dp: settings.priceNumDecimals,
		shippingTaxClass:
			settings.shippingTaxClass === INHERIT_TAX_CLASS
				? INHERIT_TAX_CLASS
				: taxClassToWire(taxClassFromWire(settings.shippingTaxClass)),
		taxClassSlugs: settings.taxClassSlugs,
		calcDiscountsSequentially: settings.calcDiscountsSequentially,
	});
}
