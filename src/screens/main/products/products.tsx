import * as React from 'react';
import { View } from 'react-native';

import { useObservableState } from 'observable-hooks';
import { useTheme } from 'styled-components/native';

import Box from '@wcpos/components/src/box';
import ErrorBoundary from '@wcpos/components/src/error-boundary';
import Text from '@wcpos/components/src/text';
import log from '@wcpos/utils/src/logger';

import SearchBar from './components/search-bar';
import Table from './components/table';
import useLocalData from '../../../contexts/local-data';
import { ProductsProvider } from '../contexts/products';
import { TaxRateProvider } from '../contexts/tax-rates';
import useUI from '../contexts/ui-settings';

/**
 *
 */
const Products = () => {
	const { uiSettings } = useUI('products');
	const theme = useTheme();
	const { store } = useLocalData();
	const storeCity = useObservableState(store.store_city$, store?.store_city);
	const storeCountry = useObservableState(store.default_country$, store?.default_country);
	const storePostcode = useObservableState(store.store_postcode$, store?.store_postcode);
	const sortBy = uiSettings.get('sortBy');
	const sortDirection = uiSettings.get('sortDirection');
	const [tableLayout, setTableLayout] = React.useState({ width: 0, height: 0 });

	const initialTaxQuery = React.useMemo(() => {
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
	}, [storeCity, storeCountry, storePostcode]);

	/**
	 *
	 */
	const initialProductsQuery = React.useMemo(
		() => ({ sortBy, sortDirection }),
		[sortBy, sortDirection]
	);

	/**
	 *
	 */
	return (
		<TaxRateProvider initialQuery={initialTaxQuery}>
			<ProductsProvider initialQuery={initialProductsQuery} uiSettings={uiSettings}>
				<Box padding="small" style={{ height: '100%' }}>
					<Box
						raised
						rounding="medium"
						style={{ backgroundColor: 'white', flexGrow: 1, flexShrink: 1, flexBasis: '0%' }}
					>
						<Box
							horizontal
							space="small"
							padding="small"
							align="center"
							style={{
								backgroundColor: theme.colors.grey,
								borderTopLeftRadius: theme.rounding.medium,
								borderTopRightRadius: theme.rounding.medium,
							}}
						>
							<ErrorBoundary>
								<SearchBar />
							</ErrorBoundary>
						</Box>
						<Box style={{ flexGrow: 1, flexShrink: 1, flexBasis: '0%' }}>
							<React.Suspense>
								<Table uiSettings={uiSettings} />
							</React.Suspense>
						</Box>
					</Box>
				</Box>
			</ProductsProvider>
		</TaxRateProvider>
	);
};

export default Products;
