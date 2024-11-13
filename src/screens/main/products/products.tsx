import * as React from 'react';

import get from 'lodash/get';

import { Box } from '@wcpos/components/src/box';
import { Card, CardContent, CardHeader } from '@wcpos/components/src/card';
import { DataTableRow } from '@wcpos/components/src/data-table';
import { ErrorBoundary } from '@wcpos/components/src/error-boundary';
import { HStack } from '@wcpos/components/src/hstack';
import { Suspense } from '@wcpos/components/src/suspense';
import { VStack } from '@wcpos/components/src/vstack';
import { useRelationalQuery } from '@wcpos/query';

import { Actions } from './cells/actions';
import { Barcode } from './cells/barcode';
import { EditablePrice } from './cells/editable-price';
import { ProductName } from './cells/name';
import { Price } from './cells/price';
import { StockQuantity } from './cells/stock-quantity';
import { StockStatus } from './cells/stock-status';
import { VariationActions } from './cells/variation-actions';
import { ProductVariationName } from './cells/variation-name';
import { UISettingsForm } from './ui-settings-form';
import { useBarcode } from './use-barcode';
import { useT } from '../../../contexts/translations';
import { DataTable, DataTableFooter } from '../components/data-table';
import { Date } from '../components/date';
import { ProductCategories } from '../components/product/categories';
import FilterBar from '../components/product/filter-bar';
import { ProductImage } from '../components/product/image';
import { ProductTags } from '../components/product/tags';
import { TaxBasedOn } from '../components/product/tax-based-on';
import { VariableProductImage } from '../components/product/variable-image';
import { VariableProductPrice } from '../components/product/variable-price';
import { VariableProductRow } from '../components/product/variable-product-row';
import { ProductVariationImage } from '../components/product/variation-image';
import { QuerySearchInput } from '../components/query-search-input';
import { UISettingsDialog } from '../components/ui-settings';
import { useTaxRates } from '../contexts/tax-rates';
import { useUISettings } from '../contexts/ui-settings';
import { useMutation } from '../hooks/mutations/use-mutation';

type ProductDocument = import('@wcpos/database').ProductDocument;

const cells = {
	simple: {
		actions: Actions,
		image: ProductImage,
		name: ProductName,
		barcode: Barcode,
		price: Price,
		regular_price: EditablePrice,
		sale_price: EditablePrice,
		date_created: Date,
		date_modified: Date,
		stock_quantity: StockQuantity,
		stock_status: StockStatus,
		categories: ProductCategories,
		tags: ProductTags,
	},
	variable: {
		actions: Actions,
		image: VariableProductImage,
		name: ProductName,
		barcode: Barcode,
		regular_price: VariableProductPrice,
		price: VariableProductPrice,
		sale_price: VariableProductPrice,
		date_created: Date,
		date_modified: Date,
		stock_quantity: StockQuantity,
		stock_status: StockStatus,
		categories: ProductCategories,
		tags: ProductTags,
	},
};

const variationCells = {
	actions: VariationActions,
	price: Price,
	name: ProductVariationName,
	sale_price: EditablePrice,
	regular_price: EditablePrice,
	stock_quantity: StockQuantity,
	date_created: Date,
	date_modified: Date,
	barcode: Barcode,
	stock_status: StockStatus,
	image: ProductVariationImage,
	categories: () => {},
	tags: () => {},
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
 * Tables are expensive to render, so memoize all props.
 */
const Products = () => {
	const { uiSettings } = useUISettings('products');
	const { calcTaxes } = useTaxRates();
	const t = useT();
	const { patch: productsPatch } = useMutation({ collectionName: 'products' });
	const { patch: variationsPatch } = useMutation({ collectionName: 'variations' });
	const querySearchInputRef = React.useRef<React.ElementRef<typeof QuerySearchInput>>(null);

	/**
	 *
	 */
	const { parentQuery: query } = useRelationalQuery(
		{
			queryKeys: ['products', { target: 'page', type: 'relational' }],
			collectionName: 'products',
			initialParams: {
				sort: [{ [uiSettings.sortBy]: uiSettings.sortDirection }],
			},
			infiniteScroll: true,
		},
		{
			queryKeys: ['variations', { target: 'page', type: 'relational' }],
			collectionName: 'variations',
			initialParams: {
				sort: [{ id: 'asc' }],
			},
			endpoint: 'products/variations',
			greedy: true,
		}
	);

	/**
	 * Barcode
	 */
	useBarcode(query, querySearchInputRef);

	/**
	 * Table context
	 */
	const context = React.useMemo(() => ({ taxLocation: 'base' }), []);

	/**
	 * Table meta
	 */
	const tableMeta = React.useMemo(
		() => ({
			onChange: ({ document, changes }) => {
				if (document.type === 'variation') {
					variationsPatch({ document, data: changes });
				} else {
					productsPatch({ document, data: changes });
				}
			},
			variationRenderCell,
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
									ref={querySearchInputRef}
									query={query}
									placeholder={t('Search Products', { _tags: 'core' })}
									className="flex-1"
								/>
							</ErrorBoundary>
							{/* <Icon
						name="plus"
						onPress={() => navigation.navigate('AddProduct')}
						tooltip={t('Add new customer', { _tags: 'core' })}
					/> */}
							<UISettingsDialog title={t('Product Settings', { _tags: 'core' })}>
								<UISettingsForm />
							</UISettingsDialog>
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
								renderCell={renderCell}
								renderItem={renderItem}
								noDataMessage={t('No products found', { _tags: 'core' })}
								estimatedItemSize={100}
								extraContext={context}
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

export default Products;
