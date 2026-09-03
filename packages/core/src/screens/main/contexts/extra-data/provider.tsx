import * as React from 'react';

import { useQueryRuntime } from '@wcpos/query';

import { useStoreSession } from '../../../../contexts/app-state';
import { useRestHttpClient } from '../../hooks/use-rest-http-client';
import { ExtraDataContext } from './context';

function isMissing(value: unknown): boolean {
	return value == null;
}

/**
 * WooCommerce has a lot of extra data that we need, we'll bring it all together here.
 * - Tax classes
 * - Shipping methods
 * - Order statuses
 * - Payment methods
 * @TODO - we should move country codes to here too, and currency codes
 * @TODO - there must be a smarter way to only fetch data on chnages
 */
export function ExtraDataProvider({ children }: { children: React.ReactNode }) {
	const http = useRestHttpClient();
	const { extraData } = useStoreSession();
	const { engine } = useQueryRuntime();

	React.useEffect(() => {
		// Store-scoped bridge from the sync engine's public event stream to persisted RxState.
		let refreshGeneration = 0;
		const fetchTaxClasses = (generation: number) =>
			void http
				.get('/taxes/classes')
				.then((response) => {
					if (generation === refreshGeneration && response?.status === 200) {
						void extraData.set('taxClasses', () => response.data);
					}
				})
				.catch(() => undefined);
		const fetchShippingMethods = (generation: number) =>
			void http
				.get('/shipping_methods')
				.then((response) => {
					if (generation === refreshGeneration && response?.status === 200) {
						void extraData.set('shippingMethods', () => response.data);
					}
				})
				.catch(() => undefined);
		const fetchOrderStatuses = (generation: number) =>
			void http
				.get('/data/order_statuses')
				.then((response) => {
					if (generation === refreshGeneration && response?.status === 200) {
						void extraData.set('orderStatuses', () => response.data);
					}
				})
				.catch(() => undefined);
		// This descriptor is the checkout-mode gate (`usePaymentMethods` → `CheckoutDocument`),
		// so unlike its three neighbours it is re-fetched on every start rather than only when
		// missing: a store that rolls the plugin back must stop being handed the tender flow.
		// A 404 is the store ANSWERING that it no longer serves the payments contract, so the
		// cached descriptor is dropped and the till falls back to the gateway checkout. Every
		// other failure — offline, timeout, a 500 — proves nothing about the store, and the
		// cached descriptor stands: an offline till keeps the tender flow it was working with,
		// which is the whole point of `capabilities.offline` and the "works offline" tile badge.
		const fetchPaymentMethods = (generation: number) =>
			void http
				.get('/payment-methods')
				.then((response) => {
					if (generation === refreshGeneration && response?.status === 200) {
						return extraData.set('paymentMethods', () => response.data);
					}
					return undefined;
				})
				.catch((error: { response?: { status?: number } }) => {
					if (generation === refreshGeneration && error?.response?.status === 404) {
						return extraData.set('paymentMethods', () => null);
					}
					return undefined;
				})
				// A failed persistence write leaves the cached descriptor stale, which is
				// tolerable; an unhandled rejection at app level is not.
				.catch(() => undefined);
		const fetchAll = () => {
			const generation = ++refreshGeneration;
			fetchTaxClasses(generation);
			fetchShippingMethods(generation);
			fetchOrderStatuses(generation);
			fetchPaymentMethods(generation);
		};

		const coldStartGeneration = ++refreshGeneration;
		if (isMissing(extraData.get('taxClasses'))) fetchTaxClasses(coldStartGeneration);
		if (isMissing(extraData.get('shippingMethods'))) fetchShippingMethods(coldStartGeneration);
		if (isMissing(extraData.get('orderStatuses'))) fetchOrderStatuses(coldStartGeneration);
		fetchPaymentMethods(coldStartGeneration);

		const unsubscribeEvents = engine.events((event) => {
			if (event.type === 'config-changed') fetchAll();
		});

		return () => {
			refreshGeneration += 1;
			unsubscribeEvents();
		};
	}, [engine, extraData, http]);

	return <ExtraDataContext.Provider value={{ extraData }}>{children}</ExtraDataContext.Provider>;
}
