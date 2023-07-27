import * as React from 'react';
import { View } from 'react-native';

import { useTheme } from 'styled-components/native';

import Box from '@wcpos/components/src/box';
import ErrorBoundary from '@wcpos/components/src/error-boundary';
import Suspense from '@wcpos/components/src/suspense';
import Text from '@wcpos/components/src/text';
import log from '@wcpos/utils/src/logger';

import SearchBar from './components/search-bar';
import Table from './components/table';
import { ProductsProvider } from '../contexts/products';
import { Query } from '../contexts/query';
import { TaxRateProvider } from '../contexts/tax-rates';
import useUI from '../contexts/ui-settings';
import useBaseTaxLocation from '../hooks/use-base-tax-location';

type ProductCollection = import('@wcpos/database').ProductCollection;
type TaxRateCollection = import('@wcpos/database').TaxRateCollection;

/**
 *
 */
const Products = () => {
	const { uiSettings } = useUI('products');
	const theme = useTheme();
	const location = useBaseTaxLocation();

	const taxQuery = React.useMemo(
		() =>
			new Query<TaxRateCollection>({
				search: { ...location },
			}),
		[location]
	);

	/**
	 *
	 */
	const productsQuery = React.useMemo(
		() =>
			new Query<ProductCollection>({
				sortBy: uiSettings.get('sortBy'),
				sortDirection: uiSettings.get('sortDirection'),
			}),
		[uiSettings]
	);

	/**
	 *
	 */
	return (
		<TaxRateProvider query={taxQuery}>
			<ProductsProvider query={productsQuery}>
				<Box padding="small" style={{ height: '100%' }}>
					<Box
						raised
						rounding="medium"
						style={{ backgroundColor: 'white', flexGrow: 1, flexShrink: 1, flexBasis: '0%' }}
					>
						<Box
							horizontal
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
							<ErrorBoundary>
								<Suspense>
									<Table uiSettings={uiSettings} />
								</Suspense>
							</ErrorBoundary>
						</Box>
					</Box>
				</Box>
			</ProductsProvider>
		</TaxRateProvider>
	);
};

export default Products;
