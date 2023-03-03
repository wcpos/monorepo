import * as React from 'react';

import { useObservableState } from 'observable-hooks';
import { useTheme } from 'styled-components/native';

import Box from '@wcpos/components/src/box';
import ErrorBoundary from '@wcpos/components/src/error-boundary';
import Text from '@wcpos/components/src/text';
import log from '@wcpos/utils/src/logger';

import SearchBar from './components/search-bar';
import Table from './components/table';
import useLocalData from '../../../contexts/local-data';
import { t } from '../../../lib/translations';
import UiSettings from '../components/ui-settings';
import { ProductCategoriesProvider } from '../contexts/categories';
import { ProductsProvider } from '../contexts/products';
import { ProductTagsProvider } from '../contexts/tags';
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

	const initialQuery = React.useMemo(() => {
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

	return (
		<TaxRateProvider initialQuery={initialQuery}>
			<ProductsProvider
				initialQuery={{
					sortBy: uiSettings.get('sortBy'),
					sortDirection: uiSettings.get('sortDirection'),
				}}
				uiSettings={uiSettings}
			>
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
							<ProductCategoriesProvider initialQuery={{}}>
								<ProductTagsProvider initialQuery={{}}>
									<SearchBar />
								</ProductTagsProvider>
							</ProductCategoriesProvider>
							<UiSettings
								uiSettings={uiSettings}
								title={t('Product Settings', { _tags: 'core' })}
							/>
						</Box>
						<Box style={{ flexGrow: 1, flexShrink: 1, flexBasis: '0%' }}>
							<React.Suspense fallback={<Text>Loading products table...</Text>}>
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
