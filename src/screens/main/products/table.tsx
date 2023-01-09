import * as React from 'react';

import get from 'lodash/get';
import { useObservableState } from 'observable-hooks';

import ErrorBoundary from '@wcpos/components/src/error-boundary';
import Table, { TableExtraDataProps, CellRenderer } from '@wcpos/components/src/table';
import Text from '@wcpos/components/src/text';
import useWhyDidYouUpdate from '@wcpos/hooks/src/use-why-did-you-update';
import log from '@wcpos/utils/src/logger';

import useProducts from '../../../contexts/products';
import { VariationsProvider } from '../../../contexts/variations';
import { t } from '../../../lib/translations';
import cells from './cells';
import Footer from './footer';

import type { ListRenderItemInfo } from '@shopify/flash-list';

type ProductDocument = import('@wcpos/database').ProductDocument;
type UIColumn = import('../../../contexts/ui').UIColumn;

interface ProductsTableProps {
	ui: import('../../../contexts/ui').UIDocument;
}

/**
 *
 */
const ProductsTable = ({ ui }: ProductsTableProps) => {
	const { query$, setQuery, data: products } = useProducts();
	const query = useObservableState(query$, query$.getValue());
	const columns = useObservableState(ui.get$('columns'), ui.get('columns')) as UIColumn[];
	log.debug('render products table');

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
				return t('Products', { _tags: 'core', _context: 'Table header' });
			case 'sku':
				return t('SKU', { _tags: 'core' });
			case 'type':
				return t('Type', { _tags: 'core' });
			case 'stock_quantity':
				return t('Stock', { _tags: 'core' });
			case 'price':
				return t('Price', { _tags: 'core' });
			case 'regular_price':
				return t('Regular Price', { _tags: 'core' });
			case 'sale_price':
				return t('Sale Price', { _tags: 'core' });
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
	const renderItem = ({ item, index, extraData, target }: ListRenderItemInfo<ProductDocument>) => {
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
	};

	/**
	 *
	 */
	useWhyDidYouUpdate('Table', { products });

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
		/>
	);
};

export default ProductsTable;
