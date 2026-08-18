export type CustomerDisplayRouteState = {
	enabled: boolean;
	status: 'cart' | 'awaiting-payment';
};

/** Maps Expo route-pattern segments to the customer-display lifecycle. */
export function getCustomerDisplayRouteState(
	segments: readonly string[]
): CustomerDisplayRouteState {
	const isActivePOSRoute = segments.includes('(pos)');
	const isReceipt = segments.includes('receipt');

	return {
		enabled: isActivePOSRoute && !isReceipt,
		status: segments.includes('checkout') ? 'awaiting-payment' : 'cart',
	};
}
