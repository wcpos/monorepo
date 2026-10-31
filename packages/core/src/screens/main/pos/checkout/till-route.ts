import type { ImperativeRouter } from 'expo-router';

// From checkout, the /cart tie between (columns) and (tabs) resolves to (columns) (#2363).
// Pop the sheet on every width; phones target (tabs) explicitly with dismissTo.
// The wide replace survives only when nothing is beneath the sheet; the layout's `anchor` makes that rare.

/** The phone tab checkout hands the cashier back to. */
export type TillTab = 'products' | 'cart';

/** Where checkout returns to: the explicit phone (tabs) route on a phone, `/cart` when wide. */
export function tillHref(compact: boolean, tab: TillTab) {
	return compact
		? tab === 'products'
			? '/(app)/(drawer)/(pos)/(tabs)'
			: '/(app)/(drawer)/(pos)/(tabs)/cart'
		: '/cart';
}

/** Pops checkout to the till, falling back to the wide cart for a deep link. */
export function returnToTill(
	router: Pick<ImperativeRouter, 'replace' | 'dismissTo' | 'dismiss' | 'canDismiss'>,
	compact: boolean,
	tab: TillTab
): void {
	if (compact) router.dismissTo(tillHref(true, tab));
	else if (router.canDismiss()) router.dismiss();
	else router.replace({ pathname: '/cart' });
}

/**
 * Checkout for one order as it stands, whatever its status. Wide screens otherwise redirect
 * checkout to the columns cart, which resolves only open orders (pos-open, pos-partial,
 * pending): an order that is not an open cart (a refused reopen, back to completed) would land
 * the cashier on a new cart instead of its payments.
 */
export const STANDALONE_CHECKOUT_PARAM = 'standalone';

export function standaloneCheckoutHref(orderId: string) {
	return {
		pathname: '/(app)/(drawer)/(pos)/(modals)/cart/[orderId]/checkout',
		params: { orderId, [STANDALONE_CHECKOUT_PARAM]: '1' },
	} as const;
}

/** Pops a wide checkout sheet onto the till beneath; a cold-loaded sheet, which cannot pop, replaces (#3148). */
export function handSheetToColumns(
	router: Pick<ImperativeRouter, 'replace' | 'dismiss' | 'canDismiss'>,
	orderId: string
): void {
	if (router.canDismiss()) router.dismiss();
	else
		router.replace({
			pathname: '/(app)/(drawer)/(pos)/(columns)/cart/[...orderId]',
			params: { orderId: [orderId, 'checkout'] },
		});
}
