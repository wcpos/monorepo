import * as React from 'react';

import { useTheme } from 'styled-components/native';

import Box from '@wcpos/components/src/box';
import ErrorBoundary from '@wcpos/components/src/error-boundary';
import Suspense from '@wcpos/components/src/suspense';

import SimpleProductTableRow from './rows/simple';
import VariableProductTableRow from './rows/variable';
import SearchBar from './search-bar';
import { useQuery } from '../../../contexts/store-state-manager';
import { t } from '../../../lib/translations';
import DataTable from '../components/data-table';
import useUI from '../contexts/ui-settings';
import useBaseTaxLocation from '../hooks/use-base-tax-location';

type ProductDocument = import('@wcpos/database').ProductDocument;

// Table Rows
const TABLE_ROW_COMPONENTS = {
	simple: SimpleProductTableRow,
	variable: VariableProductTableRow,
};

/**
 *
 */
const Products = () => {
	const { uiSettings } = useUI('products');
	const theme = useTheme();
	const location = useBaseTaxLocation();

	/**
	 *
	 */
	useQuery({
		queryKeys: ['tax-rates', 'base'],
		collectionName: 'taxes',
		initialQuery: {
			search: location,
		},
	});

	/**
	 *
	 */
	const productQuery = useQuery({
		queryKeys: ['products'],
		collectionName: 'products',
		initialQuery: {
			sortBy: uiSettings.get('sortBy'),
			sortDirection: uiSettings.get('sortDirection'),
		},
	});

	/**
	 *
	 */
	const renderItem = React.useCallback((props) => {
		let Component = TABLE_ROW_COMPONENTS[props.item.type];

		// If we still didn't find a component, use SimpleProductTableRow as a fallback
		// eg: Grouped products
		if (!Component) {
			Component = SimpleProductTableRow;
		}

		return (
			<ErrorBoundary>
				<Component {...props} />
			</ErrorBoundary>
		);
	}, []);

	/**
	 *
	 */
	return (
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
						<SearchBar query={productQuery} />
					</ErrorBoundary>
				</Box>
				<Box style={{ flexGrow: 1, flexShrink: 1, flexBasis: '0%' }}>
					<ErrorBoundary>
						<Suspense>
							<DataTable<ProductDocument>
								query={productQuery}
								uiSettings={uiSettings}
								renderItem={renderItem}
								noDataMessage={t('No products found', { _tags: 'core' })}
								estimatedItemSize={100}
								extraContext={{ taxLocation: 'base' }}
							/>
						</Suspense>
					</ErrorBoundary>
				</Box>
			</Box>
		</Box>
	);
};

export default Products;
