import * as React from 'react';

import get from 'lodash/get';
import { useObservableState } from 'observable-hooks';

import ErrorBoundary from '@wcpos/components/src/error-boundary';
import Table, { TableExtraDataProps, CellRenderer } from '@wcpos/components/src/table';
import Text from '@wcpos/components/src/text';
import useWhyDidYouUpdate from '@wcpos/hooks/src/use-why-did-you-update';
import log from '@wcpos/utils/src/logger';

import cells from './cells';
import Footer from './footer';
import TextCell from '../../components/text-cell';
import useProducts from '../../contexts/products';
import { VariationsProvider } from '../../contexts/variations';

import type { ListRenderItemInfo } from '@shopify/flash-list';

type ProductDocument = import('@wcpos/database').ProductDocument;
type UISettingsColumn = import('../../contexts/ui-settings').UISettingsColumn;

interface ProductsTableProps {
	uiSettings: import('../../contexts/ui-settings').UISettingsDocument;
}

/**
 *
 */
const ProductsTable = ({ uiSettings }: ProductsTableProps) => {
	const { query$, setQuery, data: products } = useProducts();
	const query = useObservableState(query$, query$.getValue());
	const columns = useObservableState(
		uiSettings.get$('columns'),
		uiSettings.get('columns')
	) as UISettingsColumn[];
	log.debug('render products table');

	/**
	 *
	 */
	const cellRenderer = React.useCallback<CellRenderer<ProductDocument>>(
		({ item, column, index }) => {
			const Cell = get(cells, [item.type, column.key], cells.simple[column.key]);

			if (Cell) {
				return (
					<ErrorBoundary>
						<React.Suspense fallback={<Text>Loading...</Text>}>
							<Cell item={item} column={column} index={index} />
						</React.Suspense>
					</ErrorBoundary>
				);
			}

			return <TextCell item={item} column={column} />;
		},
		[]
	);

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
			headerLabel: ({ column }) => uiSettings.getLabel(column.key),
		};
	}, [columns, query.sortBy, query.sortDirection, cellRenderer, setQuery, uiSettings]);

	/**
	 *
	 */
	const renderItem = ({ item, index, extraData, target }: ListRenderItemInfo<ProductDocument>) => {
		console.log('ProductsTable renderItem', item.id);
		if (item.type === 'variable') {
			return (
				<ErrorBoundary>
					<VariationsProvider parent={item} uiSettings={uiSettings}>
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
	};

	/**
	 *
	 */
	useWhyDidYouUpdate('Table', { products, uiSettings });

	/**
	 *
	 */
	return (
		<Table<ProductDocument>
			data={products}
			footer={<Footer count={products.length} />}
			estimatedItemSize={150}
			extraData={context}
			renderItem={renderItem}
			// getItemType={(item) => item.type}
		/>
	);
};

export default ProductsTable;
