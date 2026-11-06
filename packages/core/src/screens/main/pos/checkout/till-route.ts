import type { Href, ImperativeRouter } from 'expo-router';

// From checkout, the /cart tie between (columns) and (tabs) resolves to (columns) (#2363), so phones
// dismissTo the explicit (tabs) route.

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
	else leaveSheet(router, { pathname: '/cart' });
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

/** The (pos) layout's anchor: a sheet directly above it was cold-loaded, so no till lies beneath. */
const POS_ANCHOR_ROUTE = 'index';

/** The name of the route beneath the focused one in a stack's state (which may be unset). */
export function routeBeneath(
	state: { index: number; routes: { name: string }[] } | undefined
): string | undefined {
	return state?.routes[state.index - 1]?.name;
}

/**
 * Leaves a (pos) sheet for the till beneath it; a replace would stack a second POS screen
 * (#3148). `canDismiss` alone is not enough: it reports true over the anchor, and dismissing
 * there runs the anchor's redirect to the till, so a sheet above the anchor takes the fallback.
 */
export function leaveSheet(
	router: Pick<ImperativeRouter, 'replace' | 'dismiss' | 'canDismiss'>,
	fallback: Href,
	beneath?: string
): void {
	if (beneath !== POS_ANCHOR_ROUTE && router.canDismiss()) router.dismiss();
	else router.replace(fallback);
}

/** The columns cart in checkout for one order: the wide host of the tender pane. */
export function columnsCheckoutHref(orderId: string): Href {
	return {
		pathname: '/(app)/(drawer)/(pos)/(columns)/cart/[...orderId]',
		params: { orderId: [orderId, 'checkout'] },
	};
}

/** A reopened order's cart: /cart ties to (columns), not the phone's tabs (#2374). */
export function tillCartHref(compact: boolean, orderId: string | undefined) {
	return {
		pathname: compact ? '/(app)/(drawer)/(pos)/(tabs)/cart/[...orderId]' : '/cart/[...orderId]',
		params: { orderId: orderId ? [orderId] : [] },
	} as const;
}

/**
 * Opens the till on an order (or on a new cart) from anywhere in the app: a NAVIGATE, never a push
 * (a push from another drawer page stacked a second POS screen and doubled every scan, #3283). The
 * (pos) stack's own invariant (`till-stack.ts`) settles the stack if the navigate still lands a
 * second till.
 */
export function openTill(
	router: Pick<ImperativeRouter, 'navigate'>,
	compact: boolean,
	orderId?: string
): void {
	router.navigate(tillCartHref(compact, orderId));
}
