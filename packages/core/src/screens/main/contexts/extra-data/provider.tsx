import * as React from 'react';

import { useQueryRuntime } from '@wcpos/query';

import { useAppState } from '../../../../contexts/app-state';
import { useRestHttpClient } from '../../hooks/use-rest-http-client';

interface ExtraDataContextProps {
	extraData: import('rxdb').RxState<Record<string, unknown>>;
}

export const ExtraDataContext = React.createContext<ExtraDataContextProps | null>(null);

function isMissing(value: unknown): boolean {
	return value == null;
}

/**
 * WooCommerce has a lot of extra data that we need, we'll bring it all together here.
 * - Tax classes
 * - Shipping methods
 * - Order statuses
 * @TODO - we should move country codes to here too, and currency codes
 * @TODO - there must be a smarter way to only fetch data on chnages
 */
export function ExtraDataProvider({ children }: { children: React.ReactNode }) {
	const http = useRestHttpClient();
	const { extraData } = useAppState();
	const { engine } = useQueryRuntime();

	React.useEffect(() => {
		// Store-scoped bridge from the sync engine's public event stream to persisted RxState.
		let refreshGeneration = 0;
		const fetchTaxClasses = (generation: number) =>
			void http
				.get('/taxes/classes')
				.then((response) => {
					if (generation === refreshGeneration && response?.status === 200) {
						extraData.set('taxClasses', () => response.data);
					}
				})
				.catch(() => undefined);
		const fetchShippingMethods = (generation: number) =>
			void http
				.get('/shipping_methods')
				.then((response) => {
					if (generation === refreshGeneration && response?.status === 200) {
						extraData.set('shippingMethods', () => response.data);
					}
				})
				.catch(() => undefined);
		const fetchOrderStatuses = (generation: number) =>
			void http
				.get('/data/order_statuses')
				.then((response) => {
					if (generation === refreshGeneration && response?.status === 200) {
						extraData.set('orderStatuses', () => response.data);
					}
				})
				.catch(() => undefined);
		const fetchAll = () => {
			const generation = ++refreshGeneration;
			fetchTaxClasses(generation);
			fetchShippingMethods(generation);
			fetchOrderStatuses(generation);
		};

		const coldStartGeneration = ++refreshGeneration;
		if (isMissing(extraData.get('taxClasses'))) fetchTaxClasses(coldStartGeneration);
		if (isMissing(extraData.get('shippingMethods'))) fetchShippingMethods(coldStartGeneration);
		if (isMissing(extraData.get('orderStatuses'))) fetchOrderStatuses(coldStartGeneration);

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
