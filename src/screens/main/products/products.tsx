import * as React from 'react';

import { useTheme } from 'styled-components/native';

import Box from '@wcpos/components/src/box';
import ErrorBoundary from '@wcpos/components/src/error-boundary';
import Text from '@wcpos/components/src/text';
import log from '@wcpos/utils/src/logger';

import SearchBar from './components/search-bar';
import Table from './components/table';
import { t } from '../../../lib/translations';
import UiSettings from '../components/ui-settings';
import { ProductsProvider } from '../contexts/products';
import { TaxesProvider } from '../contexts/taxes';
import useUI from '../contexts/ui-settings';

/**
 *
 */
const Products = () => {
	const { uiSettings } = useUI('products');
	const theme = useTheme();

	return (
		<TaxesProvider initialQuery={{ country: 'GB' }}>
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
							<SearchBar />
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
		</TaxesProvider>
	);
};

export default Products;
