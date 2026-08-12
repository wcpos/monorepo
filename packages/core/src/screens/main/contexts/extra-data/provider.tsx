import * as React from 'react';

import { useQueryRuntime } from '@wcpos/query';

import { useAppState } from '../../../../contexts/app-state';
import { useRestHttpClient } from '../../hooks/use-rest-http-client';

interface ExtraDataContextProps {
	extraData: import('rxdb').RxState<Record<string, unknown>>;
}

export const ExtraDataContext = React.createContext<ExtraDataContextProps | null>(null);

function isMissingOrEmpty(value: unknown): boolean {
	return (
		value == null ||
		value === '' ||
		(Array.isArray(value) && value.length === 0) ||
		(typeof value === 'object' && Object.keys(value).length === 0)
	);
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
	const dependencies = React.useRef({ http, extraData, engine });

	React.useEffect(() => {
		// Mount-scoped bridge from the sync engine's public event stream to persisted RxState.
		const { http, extraData, engine } = dependencies.current;
		const fetchTaxClasses = () =>
			void http.get('/taxes/classes').then((response) => {
				if (response?.status === 200) {
					extraData.set('taxClasses', () => response.data);
				}
			});
		const fetchShippingMethods = () =>
			void http.get('/shipping_methods').then((response) => {
				if (response?.status === 200) {
					extraData.set('shippingMethods', () => response.data);
				}
			});
		const fetchOrderStatuses = () =>
			void http.get('/data/order_statuses').then((response) => {
				if (response?.status === 200) {
					extraData.set('orderStatuses', () => response.data);
				}
			});
		const fetchAll = () => {
			fetchTaxClasses();
			fetchShippingMethods();
			fetchOrderStatuses();
		};

		if (isMissingOrEmpty(extraData.get('taxClasses'))) fetchTaxClasses();
		if (isMissingOrEmpty(extraData.get('shippingMethods'))) fetchShippingMethods();
		if (isMissingOrEmpty(extraData.get('orderStatuses'))) fetchOrderStatuses();

		const unsubscribeEvents = engine.events((event) => {
			if (event.type === 'config-changed') fetchAll();
		});

		return unsubscribeEvents;
	}, []);

	return <ExtraDataContext.Provider value={{ extraData }}>{children}</ExtraDataContext.Provider>;
}
