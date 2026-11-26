import { orderTaxLocation } from './cart-config-for-order';

import type { CartConfigInputs, OrderPayload } from './cart-config-for-order';

/**
 * Whether writing `changes` onto `payload` would move the location WooCommerce taxes the order at,
 * on an order that carries a refund. A refund keeps the rate ids it was taxed at (#3847); the
 * store refuses the same move with `wcpos_tax_location_locked`.
 */
export function refusesTaxLocationMove(
	payload: OrderPayload,
	changes: Partial<OrderPayload>,
	baseLocation: CartConfigInputs['baseLocation'],
	storeTaxBasedOn: unknown
): boolean {
	if (!payload.refunds?.length) return false;
	const before = orderTaxLocation(baseLocation, storeTaxBasedOn, payload).location;
	const next = { ...payload, ...changes };
	const after = orderTaxLocation(baseLocation, storeTaxBasedOn, next).location;
	const fields = ['country', 'state', 'city', 'postcode'] as const;
	return fields.some((key) => before[key] !== after[key]);
}
