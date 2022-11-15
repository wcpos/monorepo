import * as React from 'react';

import get from 'lodash/get';
import { useObservableState, useObservableSuspense } from 'observable-hooks';

import ErrorBoundary from '@wcpos/components/src/error-boundary';
import Table, { TableExtraDataProps, CellRenderer } from '@wcpos/components/src/table';
import Text from '@wcpos/components/src/text';
import useWhyDidYouUpdate from '@wcpos/hooks/src/use-why-did-you-update';

import useProducts from '../../../../contexts/products';
import { VariationsProvider } from '../../../../contexts/variations';
import { t } from '../../../../lib/translations';
import cells from './cells';
import Footer from './footer';

import type { ListRenderItemInfo } from '@shopify/flash-list';

type ProductDocument = import('@wcpos/database').ProductDocument;
type UIColumn = import('../../../../contexts/ui').UIColumn;

interface POSProductsTableProps {
	ui: import('../../../../contexts/ui').UIDocument;
}

/**
 *
 */
const POSProductsTable = ({ ui }: POSProductsTableProps) => {
	const { query$, setQuery, data } = useProducts();
	const query = useObservableState(query$, query$.getValue());
	const columns = useObservableState(ui.get$('columns'), ui.get('columns')) as UIColumn[];

	/**
	 *
	 */
	const cellRenderer = React.useCallback<CellRenderer<ProductDocument>>(
		({ item, column, index }) => {
			const Cell = get(cells, [item.type, column.key], cells.simple[column.key]);

			if (Cell) {
				return <Cell item={item} column={column} index={index} />;
			}

			if (item[column.key]) {
				return <Text>{String(item[column.key])}</Text>;
			}

			return null;
		},
		[]
	);

	/**
	 *
	 */
	const headerLabel = React.useCallback(({ column }) => {
		switch (column.key) {
			case 'name':
				return t('Products');
			case 'sku':
				return t('SKU');
			case 'type':
				return t('Type');
			case 'stock_quantity':
				return t('Stock');
			case 'price':
				return t('Price');
			default:
				return column.key;
		}
	}, []);

	/**
	 *
	 */
	const context = React.useMemo<TableExtraDataProps<ProductDocument>>(() => {
		return {
			columns: columns.filter((column) => column.show),
			sort: ({ sortBy, sortDirection }) => {
				setQuery('sortBy', sortBy);
				setQuery('sortDirection', sortDirection);
			},
			sortBy: query.sortBy,
			sortDirection: query.sortDirection,
			cellRenderer,
			headerLabel,
		};
	}, [columns, query.sortBy, query.sortDirection, setQuery, cellRenderer, headerLabel]);

	/**
	 *
	 */
	const renderItem = React.useCallback(
		({ item, index, extraData, target }: ListRenderItemInfo<ProductDocument>) => {
			console.log(`render item ${item.id}`);
			if (item.type === 'variable') {
				return (
					<ErrorBoundary>
						<VariationsProvider parent={item} ui={ui}>
							<Table.Row item={item} index={index} extraData={extraData} target={target} />
						</VariationsProvider>
					</ErrorBoundary>
				);
			}
			return (
				<ErrorBoundary>
					<Table.Row item={item} index={index} extraData={extraData} target={target} />
				</ErrorBoundary>
			);
		},
		[ui]
	);

	/**
	 *
	 */
	useWhyDidYouUpdate('ProductsTable', {
		t,
		query$,
		setQuery,
		ui,
		data,
		columns,
		query,
		context,
		headerLabel,
	});

	/**
	 *
	 */
	return (
		<Table<ProductDocument>
			data={data}
			footer={<Footer count={data.length} />}
			estimatedItemSize={150}
			getItemType={(item) => item.type}
			renderItem={renderItem}
			extraData={context}
		/>
	);
};

export default POSProductsTable;
