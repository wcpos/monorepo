import * as React from 'react';

import get from 'lodash/get';

import { useRelationalQuery } from '@wcpos/query';
import { Box } from '@wcpos/tailwind/src/box';
import { Card, CardContent, CardHeader } from '@wcpos/tailwind/src/card';
import { DataTableRow } from '@wcpos/tailwind/src/data-table';
import { ErrorBoundary } from '@wcpos/tailwind/src/error-boundary';
import { HStack } from '@wcpos/tailwind/src/hstack';
import { Suspense } from '@wcpos/tailwind/src/suspense';
import { VStack } from '@wcpos/tailwind/src/vstack';

import { cells } from './rows/simple';
import { VariableProductRow } from './rows/variable';
import { UISettingsForm } from './ui-settings-form';
import { useBarcode } from './use-barcode';
import { useT } from '../../../contexts/translations';
import { DataTable, DataTableFooter } from '../components/data-table';
import FilterBar from '../components/product/filter-bar';
import { TaxBasedOn } from '../components/product/tax-based-on';
import { QuerySearchInput } from '../components/query-search-input';
import { UISettingsButton } from '../components/ui-settings';
import { useTaxRates } from '../contexts/tax-rates';
import { useUISettings } from '../contexts/ui-settings';
import { useMutation } from '../hooks/mutations/use-mutation';

type ProductDocument = import('@wcpos/database').ProductDocument;

const TableFooter = () => {
	return (
		<DataTableFooter>
			<TaxBasedOn />
		</DataTableFooter>
	);
};

/**
 * Tables are expensive to render, so memoize all props.
 */
const Products = () => {
	const { uiSettings } = useUISettings('products');
	const { calcTaxes } = useTaxRates();
	const t = useT();
	const { patch: productsPatch } = useMutation({ collectionName: 'products' });
	const { patch: variationsPatch } = useMutation({ collectionName: 'variations' });

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
			return <VariableProductRow row={row} index={index} />;
		}
		return <DataTableRow row={row} index={index} />;
	}, []);

	/**
	 * Table context
	 */
	const context = React.useMemo(() => ({ taxLocation: 'base' }), []);

	/**
	 * Table meta
	 */
	const tableMeta = React.useMemo(
		() => ({
			onChange: ({ row, changes }) => {
				const type = get(row, 'original.type');
				if (type === 'variation') {
					variationsPatch({ document: row.original, data: changes });
				} else {
					productsPatch({ document: row.original, data: changes });
				}
			},
		}),
		[productsPatch, variationsPatch]
	);

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
							<UISettingsButton title={t('Product Settings', { _tags: 'core' })}>
								<UISettingsForm />
							</UISettingsButton>
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
								TableFooterComponent={calcTaxes && TableFooter}
								getItemType={({ original }) => original.type}
								tableMeta={tableMeta}
							/>
						</Suspense>
					</ErrorBoundary>
				</CardContent>
			</Card>
		</Box>
	);
};

export default Products;
