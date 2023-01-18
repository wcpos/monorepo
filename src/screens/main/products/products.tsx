import * as React from 'react';

import { useTheme } from 'styled-components/native';

import Box from '@wcpos/components/src/box';
import ErrorBoundary from '@wcpos/components/src/error-boundary';
import Text from '@wcpos/components/src/text';
import log from '@wcpos/utils/src/logger';

import SearchBar from './search-bar';
import Table from './table';
import { ProductsProvider } from '../../../contexts/products';
import { TaxesProvider } from '../../../contexts/taxes';
import useUI from '../../../contexts/ui';
import UiSettings from '../common/ui-settings';

/**
 *
 */
const Products = () => {
	const { ui } = useUI('products');
	const theme = useTheme();

	return (
		<TaxesProvider initialQuery={{ country: 'GB' }}>
			<ProductsProvider initialQuery={{ sortBy: 'name', sortDirection: 'asc' }} ui={ui}>
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
							<SearchBar />
							<UiSettings ui={ui} />
						</Box>
						<Box style={{ flexGrow: 1, flexShrink: 1, flexBasis: '0%' }}>
							<React.Suspense fallback={<Text>Loading products table...</Text>}>
								<Table ui={ui} />
							</React.Suspense>
						</Box>
					</Box>
				</Box>
			</ProductsProvider>
		</TaxesProvider>
	);
};

const WrappedProducts = () => {
	return (
		<ErrorBoundary>
			<React.Suspense fallback={<Text>Loading products UI</Text>}>
				<Products />
			</React.Suspense>
		</ErrorBoundary>
	);
};

export default WrappedProducts;
