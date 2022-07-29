import * as React from 'react';
import { useObservableState, useObservableSuspense } from 'observable-hooks';
import { useTranslation } from 'react-i18next';
import get from 'lodash/get';
import useProducts from '@wcpos/hooks/src/use-products';
import useWhyDidYouUpdate from '@wcpos/hooks/src/use-why-did-you-update';
import Table, { TableContextProps } from '@wcpos/components/src/table';
import Text from '@wcpos/components/src/text';
import Actions from './cells/actions';
import Categories from '../common/product-categories';
import Image from './cells/image';
import Name from './cells/name';
import Price from './cells/price';
import RegularPrice from './cells/regular-price';
import SalePrice from './cells/sale-price';
import StockQuanity from './cells/stock-quantity';
import DateCreated from './cells/date-created';
import Tag from '../common/product-tags';
import Footer from './footer';

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
	sale_price: SalePrice,
	date_created: DateCreated,
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
	 *
	 */
	const cellRenderer = React.useCallback(({ item, column, index }) => {
		const Cell = cells[column.key];
		return Cell ? <Cell item={item} column={column} index={index} /> : null;
	}, []);

	/**
	 *
	 */
	const headerLabel = React.useCallback(
		({ column }) => {
			return t(`products.column.label.${column.key}`);
		},
		[t]
	);

	/**
	 *
	 */
	const tableContext = React.useMemo<TableContextProps<ProductDocument>>(() => {
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

	useWhyDidYouUpdate('Table', { data });

	return (
		<Table<ProductDocument>
			data={data}
			footer={<Footer count={data.length} />}
			estimatedItemSize={150}
			context={tableContext}
		/>
	);
};

export default ProductsTable;
