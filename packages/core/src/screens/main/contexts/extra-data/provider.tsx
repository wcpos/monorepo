import * as React from 'react';

import { isExpectedPreflightBlock } from '@wcpos/hooks/use-http-client/is-expected-preflight-block';
import { useQueryRuntime } from '@wcpos/query';
import { getErrorMessage, getLogger } from '@wcpos/utils/logger';

import { useStoreSession } from '../../../../contexts/app-state';
import { useRestHttpClient } from '../../hooks/use-rest-http-client';
import { ExtraDataContext } from './context';

const extraDataLogger = getLogger(['wcpos', 'extra-data']);

/**
 * The one record of a failed store-data refresh (the HTTP transport row is forensic).
 * The last saved copy stays in use, so this is lifecycle, not a problem — offline,
 * nothing was attempted at all.
 */
function noteRefreshFailure(what: string) {
	return (error: unknown) =>
		extraDataLogger[isExpectedPreflightBlock(error) ? 'debug' : 'info'](
			`Store ${what} not refreshed; using the saved copy`,
			{ context: { error: getErrorMessage(error) } }
		);
}

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
				.catch(noteRefreshFailure('tax classes'));
		const fetchShippingMethods = (generation: number) =>
			void http
				.get('/shipping_methods')
				.then((response) => {
					if (generation === refreshGeneration && response?.status === 200) {
						void extraData.set('shippingMethods', () => response.data);
					}
				})
				.catch(noteRefreshFailure('shipping methods'));
		const fetchOrderStatuses = (generation: number) =>
			void http
				.get('/data/order_statuses')
				.then((response) => {
					if (generation === refreshGeneration && response?.status === 200) {
						void extraData.set('orderStatuses', () => response.data);
					}
				})
				.catch(noteRefreshFailure('order statuses'));
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
