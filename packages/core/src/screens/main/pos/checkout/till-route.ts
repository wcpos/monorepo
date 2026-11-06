import type { ImperativeRouter } from 'expo-router';

/** Opens the till on an order (or on a new cart) from anywhere in the app. The (pos) stack's own
 * invariant (`till-stack.ts`) settles the stack if the navigate lands a second till. */
export function openTill(router: Pick<ImperativeRouter, 'navigate'>, orderId?: string): void {
	router.navigate(
		orderId
			? { pathname: '/cart/[...orderId]', params: { orderId: [orderId] } }
			: { pathname: '/cart' }
	);
}

/**
 * Leaves the checkout sheet for the till it was pushed from.
 *
 * The sheet is pushed onto the (pos) stack by the Pay button. `router.replace('/cart')` swapped
 * the sheet for a NEW `(columns)/cart` route and left the original POS screen mounted beneath
 * it, so every sale finished without a receipt stacked one more POS screen; each owns a document
 * keydown listener for the barcode wedge, so one scan added N units (merchant report, 1.11.6).
 * Popping the sheet returns to the one screen that was there. The replace survives only when
 * nothing is beneath the sheet, which the layout's `initialRouteName` makes rare.
 */
export function returnToTill(
	router: Pick<ImperativeRouter, 'canDismiss' | 'dismiss' | 'replace'>
): void {
	if (router.canDismiss()) router.dismiss();
	else router.replace({ pathname: '/cart' });
}
