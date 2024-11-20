import * as React from 'react';

import { useAppState } from '../../../../contexts/app-state';
import { useRestHttpClient } from '../../hooks/use-rest-http-client';

interface ExtraDataContextProps {}

export const ExtraDataContext = React.createContext<ExtraDataContextProps>(null);

/**
 * WooCommerce has a lot of extra data that we need, we'll bring it all together here.
 * - Tax classes
 * - Shipping methods
 * - Order statuses
 * @TODO - we should move country codes to here too, and currency codes
 * @TODO - there must be a smarter way to only fetch data on chnages
 */
export const ExtraDataProvider = ({ children }) => {
	const http = useRestHttpClient();
	const { extraData } = useAppState();

	React.useEffect(() => {
		http.get('/taxes/classes').then((response) => {
			if (response.status === 200) {
				extraData.set('taxClasses', () => response.data);
			}
		});
		http.get('/shipping_methods').then((response) => {
			if (response.status === 200) {
				extraData.set('shippingMethods', () => response.data);
			}
		});
		http.get('/data/order_statuses').then((response) => {
			if (response.status === 200) {
				extraData.set('orderStatuses', () => response.data);
			}
		});
	}, []);

	return <ExtraDataContext.Provider value={{ extraData }}>{children}</ExtraDataContext.Provider>;
};
