import * as React from 'react';
import { useTheme } from 'styled-components/native';
import { ProductsProvider } from '@wcpos/core/src/contexts/products';
import { TaxesProvider } from '@wcpos/core/src/contexts/taxes';
import Box from '@wcpos/components/src/box';
import Text from '@wcpos/components/src/text';
import ErrorBoundary from '@wcpos/components/src/error-boundary';
import Table from './table';
import SearchBar from './search-bar';
import UiSettings from '../common/ui-settings';
import useUI from '../../../contexts/ui';

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
