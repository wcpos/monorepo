import * as React from 'react';
import { useWindowDimensions } from 'react-native';

import { useObservableState } from 'observable-hooks';
import { useTheme } from 'styled-components/native';

import ErrorBoundary from '@wcpos/components/src/error-boundary';
import Text from '@wcpos/components/src/text';
import log from '@wcpos/utils/src/logger';

import POSColumns from './columns';
import useCurrentOrder from './contexts/current-order';
import POSTabs from './tabs';
import useLocalData from '../../../contexts/local-data';
import { TaxRateProvider } from '../contexts/tax-rates';

/**
 * Tax query depends on store.tax_based_on, if customer also depends on currentOrder
 */
const POS = () => {
	const theme = useTheme();
	const dimensions = useWindowDimensions();
	const { store } = useLocalData();
	const { currentOrder } = useCurrentOrder();
	const taxBasedOn = useObservableState(store.tax_based_on$, store?.tax_based_on);
	const storeCity = useObservableState(store.store_city$, store?.store_city);
	const storeCountry = useObservableState(store.default_country$, store?.default_country);
	const storePostcode = useObservableState(store.store_postcode$, store?.store_postcode);
	// const billing = useObservableState(currentOrder.billing$, currentOrder?.billing);
	// const shipping = useObservableState(currentOrder.shipping$, currentOrder?.shipping);
	/**
	 * FXME: useObservableState causes infinite loop
	 */
	const billing = currentOrder?.billing;
	const shipping = currentOrder?.shipping;

	const initialQuery = React.useMemo(() => {
		if (taxBasedOn === 'base') {
			/**
			 * default_country has a weird format, eg: US:CA
			 */
			const [country, state] = (storeCountry || '').split(':');
			return {
				city: storeCity,
				country,
				state,
				postcode: storePostcode,
			};
		}
		if (taxBasedOn === 'billing') {
			return {
				city: billing?.city,
				country: billing?.country,
				state: billing?.state,
				postcode: billing?.postcode,
			};
		}
		return {
			city: shipping?.city,
			country: shipping?.country,
			state: shipping?.state,
			postcode: shipping?.postcode,
		};
	}, [
		taxBasedOn,
		shipping?.city,
		shipping?.country,
		shipping?.state,
		shipping?.postcode,
		storeCountry,
		storeCity,
		storePostcode,
		billing?.city,
		billing?.country,
		billing?.state,
		billing?.postcode,
	]);

	return (
		<TaxRateProvider initialQuery={initialQuery}>
			<ErrorBoundary>
				<React.Suspense fallback={<Text>Loading POS UI...</Text>}>
					{dimensions.width >= theme.screens.small ? <POSColumns /> : <POSTabs />}
				</React.Suspense>
			</ErrorBoundary>
		</TaxRateProvider>
	);
};

export default POS;
