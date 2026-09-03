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
	const [verifiedPaymentMethodsFor, setVerifiedPaymentMethodsFor] = React.useState<
		typeof extraData | null
	>(null);
	const paymentMethodsVerified = verifiedPaymentMethodsFor === extraData;

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
		const fetchPaymentMethods = (generation: number) =>
			void http
				.get('/payment-methods')
				.then(async (response) => {
					if (generation === refreshGeneration && response?.status === 200) {
						await extraData.set('paymentMethods', () => response.data);
						if (generation === refreshGeneration) setVerifiedPaymentMethodsFor(extraData);
					}
				})
				.catch(() => {
					if (generation === refreshGeneration) setVerifiedPaymentMethodsFor(null);
				});
		const fetchAll = () => {
			const generation = ++refreshGeneration;
			setVerifiedPaymentMethodsFor(null);
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

	return (
		<ExtraDataContext.Provider value={{ extraData, paymentMethodsVerified }}>
			{children}
		</ExtraDataContext.Provider>
	);
}
