import * as React from 'react';
import { useObservableState, useObservableSuspense } from 'observable-hooks';
import { useTranslation } from 'react-i18next';
import orderBy from 'lodash/orderBy';
import get from 'lodash/get';
import useProducts from '@wcpos/hooks/src/use-products';
import useWhyDidYouUpdate from '@wcpos/hooks/src/use-why-did-you-update';
import Table from '@wcpos/components/src/table';
import Actions from './cells/actions';
import Categories from '../common/product-categories';
import Image from './cells/image';
import Name from './cells/name';
import Price from './cells/price';
import RegularPrice from './cells/regular-price';
import StockQuanity from './cells/stock-quantity';
// import Sku from './cells/sku';
import Tag from '../common/product-tags';
import Footer from './footer';

type Sort = import('@wcpos/components/src/table/types').Sort;
type SortDirection = import('@wcpos/components/src/table/types').SortDirection;
type ProductDocument = import('@wcpos/database').ProductDocument;
type UIColumn = import('@wcpos/hooks/src/use-ui-resource').UIColumn;

interface ProductsTableProps {
	ui: import('@wcpos/hooks/src/use-ui-resource').UIDocument;
}

const cells = {
	actions: Actions,
	categories: Categories,
	image: Image,
	name: Name,
	price: Price,
	regular_price: RegularPrice,
	// sku: Sku,
	stock_quantity: StockQuanity,
	tag: Tag,
};

/**
 *
 */
const ProductsTable = ({ ui }: ProductsTableProps) => {
	const { t } = useTranslation();
	const { query$, setQuery, resource } = useProducts();
	const query = useObservableState(query$, query$.getValue());
	const data = useObservableSuspense(resource);
	const columns = useObservableState(ui.get$('columns'), ui.get('columns')) as UIColumn[];

	/**
	 * - filter visible columns
	 * - translate column label
	 * - asssign cell renderer
	 */
	const visibleColumns = React.useMemo(
		() =>
			columns
				.filter((column) => column.show)
				.map((column) => ({
					...column,
					label: t(`products.column.label.${column.key}`),
				})),
		[columns, t]
	);

	const cellRenderer = React.useCallback((item: ProductDocument, column: ColumnProps) => {
		const Cell = get(cells, column.key);
		return Cell ? <Cell item={item} column={column} /> : null;
	}, []);

	/**
	 * handle sort
	 */
	const handleSort: Sort = React.useCallback(
		({ sortBy, sortDirection }) => {
			setQuery('sortBy', sortBy);
			setQuery('sortDirection', sortDirection);
		},
		[setQuery]
	);

	/**
	 *
	 */
	const rowRenderer = React.useCallback(
		(
			item,
			index
			// renderContext: TableRowRenderContext<T>,
		) => {
			// subscribe to item, special case to trigger render for data changes
			// @TODO: find a better way to do this
			// @ts-ignore
			// const forceRender = useObservableState(item.$);

			return (
				<Table.Row
					// config={renderContext}
					item={item}
					columns={visibleColumns}
					itemIndex={index}
					cellRenderer={cellRenderer}
				/>
			);
		},
		[cellRenderer, visibleColumns]
	);

	useWhyDidYouUpdate('Table', { data });

	return (
		<Table<ProductDocument>
			columns={visibleColumns}
			data={data}
			sort={handleSort}
			sortBy={query.sortBy}
			sortDirection={query.sortDirection}
			footer={<Footer count={data.length} />}
			rowRenderer={rowRenderer}
		/>
	);
};

export default ProductsTable;
