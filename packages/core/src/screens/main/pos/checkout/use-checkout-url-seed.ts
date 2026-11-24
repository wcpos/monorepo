import * as React from 'react';

import { useRouter } from 'expo-router';

import { useIsPhone } from '@wcpos/components/lib/device';
import type { QueryHandle, QueryResult } from '@wcpos/query';

import { usePaymentMethods } from '../../hooks/use-payment-methods';
import { enterCheckout, setTenderMethod } from './checkout-mode';
import { type CheckoutSeed } from './pos-url';
import { tillCartHref } from './till-route';

import type { OpenOrderHit } from '../contexts/current-order/context';

const noSubscribe = () => () => {};

/**
 * Cold-load seed: `/cart/<uuid>/checkout[/<methodId>]` re-enters checkout for that order
 * and hands the method to the store, which the tender reducer initialises from. Runs once
 * per distinct URL tuple — the route param keeps the suffix for the whole session, and a
 * tab switch must not drag the cashier back into a checkout they left.
 *
 * Same gate as Pay and `CheckoutScreen`: a store without the payment-methods contract keeps
 * its legacy modal, so the link is routed there instead of into an unusable tender column.
 *
 * Only Pay saves an order the store has not created, so a reloaded checkout for one goes back
 * to its cart (a replace, so Back does not loop). The seed waits until `openOrders` has
 * answered with the order's record; without a handle it seeds as before.
 */
export function useCheckoutUrlSeed(seed: CheckoutSeed, openOrders?: QueryHandle<QueryResult>) {
	const { orderId, checkout, methodId } = seed;
	const phone = useIsPhone();
	const { loaded, unsupportedSchema } = usePaymentMethods();
	const router = useRouter();
	const lastSeed = React.useRef<string | null>(null);
	// A primitive, so the layout above the till re-renders only when the verdict moves, never
	// on every cart write. null until the order's record can be read.
	const onStoreOf = () => {
		if (!openOrders) return true;
		const orders = openOrders.value;
		if (!checkout || !orders.ready) return null;
		const hit = (orders.hits as OpenOrderHit[]).find((candidate) => candidate.id === orderId);
		if (!hit) return null;
		// The tender's `pressLane` test: a positive integer id is an order the store has created.
		const serverId = hit.record.payload.id;
		return Number.isInteger(serverId) && Number(serverId) > 0;
	};
	const onStore = React.useSyncExternalStore(
		openOrders?.subscribe ?? noSubscribe,
		onStoreOf,
		onStoreOf
	);
	React.useEffect(() => {
		if (!checkout || !orderId || !loaded || onStore === null) return;
		const key = `${orderId}/${methodId ?? ''}`;
		if (lastSeed.current === key) return;
		lastSeed.current = key;
		if (!onStore) {
			router.replace(tillCartHref(phone, orderId));
			return;
		}
		if (!unsupportedSchema) {
			enterCheckout(orderId);
			if (methodId) setTenderMethod(orderId, methodId);
		}
		if (phone || unsupportedSchema) {
			// The sheet (phones) or the legacy modal (no contract) is a route of its own.
			router.replace({
				pathname: '/(app)/(drawer)/(pos)/(modals)/cart/[orderId]/checkout',
				params: { orderId },
			});
		}
	}, [orderId, checkout, methodId, phone, loaded, unsupportedSchema, router, onStore]);
}
