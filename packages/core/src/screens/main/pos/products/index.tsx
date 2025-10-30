import React from 'react';
import { View } from 'react-native';

import get from 'lodash/get';
import { useObservableEagerState, useObservableRef } from 'observable-hooks';
import { getExpandedRowModel } from '@tanstack/react-table';

import { Card, CardContent, CardHeader } from '@wcpos/components/card';
import { ErrorBoundary } from '@wcpos/components/error-boundary';
import { HStack } from '@wcpos/components/hstack';
import { Suspense } from '@wcpos/components/suspense';
import { VStack } from '@wcpos/components/vstack';
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
import { DataTable, DataTableFooter, defaultRenderItem } from '../../components/data-table';
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
import { TextCell } from '../../components/text-cell';

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
 *
 */
export const POSProducts = ({ isColumn = false }) => {
	const { uiSettings } = useUISettings('pos-products');
	const { calcTaxes } = useTaxRates();
	const showOutOfStock = useObservableEagerState(uiSettings.showOutOfStock$);
	const querySearchInputRef = React.useRef<React.ElementRef<typeof QuerySearchInput>>(null);
	const [expandedRef, expanded$] = useObservableRef({} as ExpandedState);
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
	 * Table config
	 */
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
				variationRenderCell,
			},
		}),
		[expandedRef, expanded$]
	);

	/**
	 *
	 */
	return (
		<View className={`h-full p-2 ${isColumn && 'pr-0'}`}>
			<Card className="flex-1">
				<CardHeader className="bg-input p-2">
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
};
