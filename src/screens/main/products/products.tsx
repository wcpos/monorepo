import * as React from 'react';

import Suspense from '@wcpos/components/src/suspense';
import { useRelationalQuery } from '@wcpos/query';
import { Box } from '@wcpos/tailwind/src/box';
import { Card, CardContent, CardHeader } from '@wcpos/tailwind/src/card';
import { ErrorBoundary } from '@wcpos/tailwind/src/error-boundary';
import { HStack } from '@wcpos/tailwind/src/hstack';
import { VStack } from '@wcpos/tailwind/src/vstack';

import SimpleProductTableRow from './rows/simple';
import VariableProductTableRow from './rows/variable';
import { useBarcode } from './use-barcode';
import { useT } from '../../../contexts/translations';
import { DataTable } from '../components/data-table';
import FilterBar from '../components/product/filter-bar';
import Search from '../components/product/search';
import { TaxBasedOn } from '../components/product/tax-based-on';
import { UISettings } from '../components/ui-settings';
import { useTaxRates } from '../contexts/tax-rates';
import { useUISettings } from '../contexts/ui-settings';

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
	const { uiSettings } = useUISettings('products');
	const { calcTaxes } = useTaxRates();
	const t = useT();

	/**
	 *
	 */
	const { parentQuery: query } = useRelationalQuery(
		{
			queryKeys: ['products', { target: 'page', type: 'relational' }],
			collectionName: 'products',
			initialParams: {
				sortBy: uiSettings.sortBy,
				sortDirection: uiSettings.sortDirection,
			},
		},
		{
			queryKeys: ['variations', { target: 'page', type: 'relational' }],
			collectionName: 'variations',
			initialParams: {
				sortBy: 'id',
				sortDirection: uiSettings.sortDirection,
			},
			endpoint: 'products/variations',
			greedy: true,
		}
	);

	/**
	 * Barcode
	 */
	useBarcode(query);

	/**
	 *
	 */
	const renderItem = React.useCallback((props) => {
		let Component = TABLE_ROW_COMPONENTS[props.item.document.type];

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
		<Box className="p-2 h-full">
			<Card className="flex-1">
				<CardHeader className="p-2 bg-input">
					<VStack>
						<HStack>
							<ErrorBoundary>
								<Search query={query} />
							</ErrorBoundary>
							{/* <Icon
						name="plus"
						onPress={() => navigation.navigate('AddProduct')}
						tooltip={t('Add new customer', { _tags: 'core' })}
					/> */}
							<UISettings
								uiSettings={uiSettings}
								title={t('Product Settings', { _tags: 'core' })}
							/>
						</HStack>
						<ErrorBoundary>
							<FilterBar query={query} />
						</ErrorBoundary>
					</VStack>
				</CardHeader>
				<CardContent className="flex-1 p-0">
					<ErrorBoundary>
						<Suspense>
							<DataTable<ProductDocument>
								id="products"
								query={query}
								renderItem={renderItem}
								noDataMessage={t('No products found', { _tags: 'core' })}
								estimatedItemSize={100}
								extraContext={{ taxLocation: 'base' }}
								footer={calcTaxes && <TaxBasedOn />}
							/>
						</Suspense>
					</ErrorBoundary>
				</CardContent>
			</Card>
		</Box>
	);
};

export default Products;
