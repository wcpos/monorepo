import * as React from 'react';

import get from 'lodash/get';
import { useObservableEagerState } from 'observable-hooks';

import { Box } from '@wcpos/components/src/box';
import { Card, CardContent, CardHeader } from '@wcpos/components/src/card';
import { DataTableRow } from '@wcpos/components/src/data-table';
import { ErrorBoundary } from '@wcpos/components/src/error-boundary';
import { HStack } from '@wcpos/components/src/hstack';
import { Suspense } from '@wcpos/components/src/suspense';
import { VStack } from '@wcpos/components/src/vstack';
import { useRelationalQuery } from '@wcpos/query';

import { Actions } from './cells/actions';
import { Name } from './cells/name';
import { Price } from './cells/price';
import { SKU } from './cells/sku';
import { StockQuantity } from './cells/stock-quantity';
import { VariableActions } from './cells/variable-actions';
import { ProductVariationActions } from './cells/variation-actions';
import { ProductVariationName } from './cells/variation-name';
import { UISettingsForm } from './ui-settings-form';
import { useBarcode } from './use-barcode';
import { useT } from '../../../../contexts/translations';
import { DataTable, DataTableFooter } from '../../components/data-table';
import FilterBar from '../../components/product/filter-bar';
import { ProductImage } from '../../components/product/image';
import { TaxBasedOn } from '../../components/product/tax-based-on';
import { VariableProductImage } from '../../components/product/variable-image';
import { VariableProductPrice } from '../../components/product/variable-price';
import { VariableProductRow } from '../../components/product/variable-product-row';
import { ProductVariationImage } from '../../components/product/variation-image';
import { QuerySearchInput } from '../../components/query-search-input';
import { UISettingsDialog } from '../../components/ui-settings';
import { useTaxRates } from '../../contexts/tax-rates';
import { useUISettings } from '../../contexts/ui-settings';

type ProductDocument = import('@wcpos/database').ProductDocument;

const cells = {
	simple: {
		actions: Actions,
		image: ProductImage,
		name: Name,
		price: Price,
		sku: SKU,
		stock_quantity: StockQuantity,
	},
	variable: {
		actions: VariableActions,
		image: VariableProductImage,
		name: Name,
		price: VariableProductPrice,
		stock_quantity: StockQuantity,
		sku: SKU,
	},
};

const variationCells = {
	actions: ProductVariationActions,
	image: ProductVariationImage,
	name: ProductVariationName,
	stock_quantity: StockQuantity,
	price: Price,
	sku: SKU,
};

/**
 *
 */
const renderCell = ({ column, row }) => {
	// just simple and variable for now
	let type = 'simple';
	if (row.original.document.type === 'variable') {
		type = 'variable';
	}
	return get(cells, [type, column.id]);
};

/**
 *
 */
const variationRenderCell = ({ column, row }) => {
	return get(variationCells, column.id);
};

/**
 *
 */
const renderItem = ({ item: row, index }) => {
	if (row.original.document.type === 'variable') {
		return <VariableProductRow row={row} index={index} />;
	}
	return <DataTableRow row={row} index={index} />;
};

/**
 *
 */
const TableFooter = () => {
	return (
		<DataTableFooter>
			<TaxBasedOn />
		</DataTableFooter>
	);
};

/**
 *
 */
const POSProducts = ({ isColumn = false }) => {
	const { uiSettings } = useUISettings('pos-products');
	const { calcTaxes } = useTaxRates();
	const showOutOfStock = useObservableEagerState(uiSettings.showOutOfStock$);
	const querySearchInputRef = React.useRef<React.ElementRef<typeof QuerySearchInput>>(null);
	const t = useT();

	/**
	 *
	 */
	const { parentQuery: query } = useRelationalQuery(
		{
			queryKeys: ['products', { target: 'pos', type: 'relational' }],
			collectionName: 'products',
			initialParams: {
				sort: [{ [uiSettings.sortBy]: uiSettings.sortDirection }],
			},
			infiniteScroll: true,
		},
		{
			queryKeys: ['variations', { target: 'pos', type: 'relational' }],
			collectionName: 'variations',
			initialParams: {
				sort: [{ id: uiSettings.sortDirection }],
			},
			endpoint: 'products/variations',
			greedy: true,
		}
	);

	/**
	 * Barcode
	 */
	const { onKeyPress } = useBarcode(query, querySearchInputRef);

	/**
	 *
	 */
	React.useEffect(() => {
		if (showOutOfStock) {
			query.removeWhere('stock_status').exec();
		} else {
			query.where('stock_status').equals('instock').exec();
		}
	}, [query, showOutOfStock]);

	/**
	 * Table meta
	 */
	const tableMeta = React.useMemo(
		() => ({
			variationRenderCell,
		}),
		[]
	);

	/**
	 *
	 */
	return (
		<Box className={`p-2 h-full ${isColumn && 'pr-0'}`}>
			<Card className="flex-1">
				<CardHeader className="p-2 bg-input">
					<ErrorBoundary>
						<VStack>
							<HStack>
								<ErrorBoundary>
									<QuerySearchInput
										ref={querySearchInputRef}
										query={query}
										placeholder={t('Search Products', { _tags: 'core' })}
										className="flex-1"
										onKeyPress={onKeyPress}
									/>
								</ErrorBoundary>
								<UISettingsDialog title={t('Product Settings', { _tags: 'core' })}>
									<UISettingsForm />
								</UISettingsDialog>
							</HStack>
							<ErrorBoundary>
								<FilterBar query={query} />
							</ErrorBoundary>
						</VStack>
					</ErrorBoundary>
				</CardHeader>
				<CardContent className="flex-1 p-0">
					<ErrorBoundary>
						<Suspense>
							<DataTable<ProductDocument>
								id="pos-products"
								query={query}
								renderCell={renderCell}
								renderItem={renderItem}
								noDataMessage={t('No products found', { _tags: 'core' })}
								estimatedItemSize={100}
								extraContext={{ taxLocation: 'pos' }}
								TableFooterComponent={calcTaxes ? TableFooter : DataTableFooter}
								getItemType={(row) => row.original.document.type}
								tableMeta={tableMeta}
							/>
						</Suspense>
					</ErrorBoundary>
				</CardContent>
			</Card>
		</Box>
	);
};

export default POSProducts;
