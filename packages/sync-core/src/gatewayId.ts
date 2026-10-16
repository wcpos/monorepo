/**
 * A WooCommerce payment-gateway id as the orders payment-method filter carries it (wcpos/roadmap#80):
 * in query state, in the browse dimension, in the lane key and on the wire. Case is preserved — Woo
 * does not lowercase gateway ids — and the charset is what the lane-key grammar can express and the
 * plugin's `sanitize => 'gateway_id'` accepts (`Collection_Rules_Plan`). Both ends share this rule
 * so a filter the grammar cannot encode is refused at the door instead of minting an unfiltered lane.
 */
export const GATEWAY_ID_PATTERN = /^[A-Za-z0-9_.-]{1,64}$/;

export function isGatewayId(value: unknown): value is string {
	return typeof value === 'string' && GATEWAY_ID_PATTERN.test(value);
}
