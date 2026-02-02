import React from 'react';
import { View } from 'react-native';

import get from 'lodash/get';
import omit from 'lodash/omit';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useObservableRef } from 'observable-hooks';
import { getExpandedRowModel } from '@tanstack/react-table';

import { Card, CardContent, CardHeader } from '@wcpos/components/card';
import { ErrorBoundary } from '@wcpos/components/error-boundary';
import { HStack } from '@wcpos/components/hstack';
import { Suspense } from '@wcpos/components/suspense';
import { VStack } from '@wcpos/components/vstack';
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
import { DataTable, DataTableFooter, defaultRenderItem } from '../components/data-table';
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
import { TextCell } from '../components/text-cell';
import { ProductBrands } from '../components/product/brands';
import { COGS } from './cells/cogs';

import type { ExpandedState } from '@tanstack/react-table';

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
		brands: ProductBrands,
		cost_of_goods_sold: COGS,
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
		brands: ProductBrands,
		cost_of_goods_sold: COGS,
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
	brands: () => {},
	cost_of_goods_sold: COGS,
};

/**
 *
 */
function renderCell(columnKey: string, info: any) {
	let type = 'simple';
	if (info.row.original.document.type === 'variable') {
		type = 'variable';
	}
	const Renderer = get(cells, [type, columnKey]);
	if (Renderer) {
		return <Renderer {...info} />;
	}

	return <TextCell {...info} />;
}

/**
 *
 */
function variationRenderCell({ column }) {
	return get(variationCells, column.id);
}

/**
 *
 */
function renderItem({ item, index, table }) {
	if (item.original.document.type === 'variable') {
		return <VariableProductRow item={item} index={index} table={table} />;
	}
	return defaultRenderItem({ item, index, table });
}

/**
 *
 */
const TableFooter = (props) => {
	return (
		<DataTableFooter {...props}>
			<TaxBasedOn />
		</DataTableFooter>
	);
};

/**
 * Tables are expensive to render, so memoize all props.
 */
export function Products() {
	const { uiSettings } = useUISettings('products');
	const { calcTaxes } = useTaxRates();
	const { patch: productsPatch } = useMutation({ collectionName: 'products' });
	const { patch: variationsPatch } = useMutation({ collectionName: 'variations' });
	const querySearchInputRef = React.useRef<React.ElementRef<typeof QuerySearchInput>>(null);
	const { bottom } = useSafeAreaInsets();
	const [expandedRef, expanded$] = useObservableRef({} as ExpandedState);
	const t = useT();

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
	 * Table config
	 */
	/**
	 * Helper to set expanded state directly, bypassing TanStack's updater function
	 * which has a minification bug with computed property destructuring.
	 * Uses lodash/omit which doesn't have this issue.
	 */
	/* eslint-disable react-compiler/react-compiler -- expandedRef is a mutable ref from useObservableRef */
	const setRowExpanded = React.useCallback(
		(rowId: string, expanded: boolean) => {
			if (expanded) {
				expandedRef.current = { ...expandedRef.current, [rowId]: true };
			} else {
				expandedRef.current = omit(expandedRef.current, rowId);
			}
		},
		[expandedRef]
	);

	const tableConfig = React.useMemo(
		() => ({
			getExpandedRowModel: getExpandedRowModel(),
			onExpandedChange: (updater) => {
				const value = typeof updater === 'function' ? updater(expandedRef.current) : updater;
				expandedRef.current = value;
			},
			getRowCanExpand: (row) => row.original.document.type === 'variable',
			meta: {
				expandedRef,
				expanded$,
				setRowExpanded,
				onChange: ({ document, changes }) => {
					if (document.type === 'variation') {
						variationsPatch({ document, data: changes });
					} else {
						productsPatch({ document, data: changes });
					}
				},
				variationRenderCell,
			},
		}),
		[expandedRef, expanded$, setRowExpanded, productsPatch, variationsPatch]
	);
	/* eslint-enable react-compiler/react-compiler */

	/**
	 *
	 */
	return (
		<View testID="screen-products" className="h-full p-2" style={{ paddingBottom: bottom !== 0 ? bottom : undefined }}>
			<Card className="flex-1">
				<CardHeader className="bg-card-header p-2">
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
				<CardContent className="border-border flex-1 border-t p-0">
					<ErrorBoundary>
						<Suspense>
							<DataTable<ProductDocument>
								id="products"
								query={query}
								renderItem={renderItem}
								renderCell={renderCell}
								noDataMessage={t('No products found', { _tags: 'core' })}
								estimatedItemSize={100}
								TableFooterComponent={calcTaxes ? TableFooter : DataTableFooter}
								getItemType={(row) => row.original.document.type}
								tableConfig={tableConfig}
							/>
						</Suspense>
					</ErrorBoundary>
				</CardContent>
			</Card>
		</View>
	);
}
