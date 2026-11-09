import * as React from 'react';

import { useGlobalSearchParams, useSegments } from 'expo-router';

import { type CheckoutSeed, readCheckoutSeed } from './checkout/pos-url';
import { tillOrderIdForRoute } from './till-order-id';

/** The routed modal on top: the (pos) sheets are checkout and receipt; any other is 'other'. */
export type TillSheet = 'checkout' | 'receipt' | 'other';

/** Where the till is, read from the router. `till-route.ts` and `till-stack.ts` are the write side. */
export interface TillLocation {
	/** Inside the (pos) group: the POS section owns scans (#1438) and the cart commands. */
	inPos: boolean;
	/**
	 * Any `(modals)` route on top, in the POS or over it (a drawer page's modal owns the address bar
	 * too; an order's receipt on /orders is `'receipt'`), so read it with `inPos` for a (pos) sheet.
	 * Null when none is focused.
	 */
	sheet: TillSheet | null;
	/** A cart route, or a (pos) sheet routed under one (`(modals)/cart/…`). */
	atCart: boolean;
	/** The `orderId` param read as a checkout link: `/cart/<uuid>/checkout[/<method>]`. */
	seed: CheckoutSeed;
}

function sheetOf(segments: string[]): TillSheet | null {
	if (!segments.includes('(modals)')) return null;
	if (segments.includes('receipt')) return 'receipt';
	if (segments.includes('checkout')) return 'checkout';
	return 'other';
}

/** The one reader of the router for the POS. Stateless: every caller gets the same answer. */
export function useTillLocation(): TillLocation {
	const segments: string[] = useSegments();
	// The catch-all `[...orderId]` hands an array (empty for /cart, a new order); a sheet, a string.
	const { orderId: orderIdParam } = useGlobalSearchParams<{ orderId: string | string[] }>();
	return {
		inPos: segments.includes('(pos)'),
		sheet: sheetOf(segments),
		atCart: segments.includes('cart'),
		seed: readCheckoutSeed(orderIdParam),
	};
}

/**
 * The order the current-order provider follows: the till's, never a sheet's (#3150). It remembers
 * ids across routes from its caller's mount, so its one caller is the (pos) layout, mounted for the
 * whole POS session.
 */
export function useTillOrderId({ inPos, sheet, atCart, seed }: TillLocation): string | undefined {
	// Remember the last valid orderId when at a cart route with an orderId.
	// This prevents losing the orderId when a modal (like settings) is opened, which
	// navigates away from the POS routes. We only remember when explicitly at a till cart
	// route with an orderId so that /cart (new order) still shows a new order, and never a
	// sheet's order: the sheets live under `(modals)/cart` but are not the till (#3150).
	//
	// This uses React's "adjusting state during render" pattern: when a new candidate
	// orderId is observed we store it immediately during render (no effect, no ref), so
	// the value survives the transition out of the POS routes when a modal opens.
	const [lastOrderId, setLastOrderId] = React.useState<string | undefined>(undefined);
	if (inPos && atCart && !sheet && seed.orderId && seed.orderId !== lastOrderId) {
		setLastOrderId(seed.orderId);
	}

	// The sheets carry their own order id; the provider follows the till (see tillOrderIdForRoute).
	const [routeTillOrderId, setRouteTillOrderId] = React.useState<string | undefined>(undefined);
	const resolved = tillOrderIdForRoute({
		inPos,
		inSheet: sheet !== null,
		orderIdFromParams: seed.orderId,
		tillOrderId: routeTillOrderId,
		lastOrderId,
	});
	if (resolved.tillOrderId !== routeTillOrderId) setRouteTillOrderId(resolved.tillOrderId);
	return resolved.orderId;
}
