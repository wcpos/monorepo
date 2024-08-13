import * as React from 'react';

import { useRelationalQuery } from '@wcpos/query';
import { Box } from '@wcpos/tailwind/src/box';
import { Card, CardContent, CardHeader } from '@wcpos/tailwind/src/card';
import { DataTableRow } from '@wcpos/tailwind/src/data-table';
import { ErrorBoundary } from '@wcpos/tailwind/src/error-boundary';
import { HStack } from '@wcpos/tailwind/src/hstack';
import { Suspense } from '@wcpos/tailwind/src/suspense';
import { Text } from '@wcpos/tailwind/src/text';
import { VStack } from '@wcpos/tailwind/src/vstack';

import { SimpleProductTableRow, cells } from './rows/simple';
import VariableProductTableRow from './rows/variable';
import { useBarcode } from './use-barcode';
import { useT } from '../../../contexts/translations';
import { DataTable } from '../components/data-table';
import FilterBar from '../components/product/filter-bar';
import { TaxBasedOn } from '../components/product/tax-based-on';
import { QuerySearchInput } from '../components/query-search-input';
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
	const renderItem = React.useCallback(({ item: row, index }) => {
		if (row.original.type === 'variable') {
			return (
				<React.Fragment key={row.id}>
					<DataTableRow row={row} index={index} />
					{row.getIsExpanded() && (
						<Box>
							<Text>test</Text>
						</Box>
					)}
				</React.Fragment>
			);
		}
		return <DataTableRow row={row} index={index} />;
	}, []);

	/**
	 *
	 */
	const context = React.useMemo(() => ({ taxLocation: 'base' }), []);

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
								<QuerySearchInput
									query={query}
									placeholder={t('Search Products', { _tags: 'core' })}
								/>
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
								cells={cells}
								renderItem={renderItem}
								noDataMessage={t('No products found', { _tags: 'core' })}
								estimatedItemSize={100}
								extraContext={context}
								footer={calcTaxes && <TaxBasedOn />}
								getItemType={({ original }) => original.type}
							/>
						</Suspense>
					</ErrorBoundary>
				</CardContent>
			</Card>
		</Box>
	);
};

export default Products;
