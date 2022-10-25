import * as React from 'react';
import { useObservableState, useObservableSuspense, ObservableResource } from 'observable-hooks';
import flatten from 'lodash/flatten';
import get from 'lodash/get';
import Table, { TableExtraDataProps, CellRenderer } from '@wcpos/components/src/table';
import Text from '@wcpos/components/src/text';
import useCart from '@wcpos/core/src/contexts/cart';
import useWhyDidYouUpdate from '@wcpos/hooks/src/use-why-did-you-update';
import { t } from '@wcpos/core/src/lib/translations';
import * as cells from './cells';

type ColumnProps = import('@wcpos/components/src/table').ColumnProps;
type Sort = import('@wcpos/components/src/table').Sort;
type SortDirection = import('@wcpos/components/src/table').SortDirection;
type OrderDocument = import('@wcpos/database').OrderDocument;
type LineItemDocument = import('@wcpos/database').LineItemDocument;
type FeeLineDocument = import('@wcpos/database').FeeLineDocument;
type ShippingLineDocument = import('@wcpos/database').ShippingLineDocument;
type CartItem = LineItemDocument | FeeLineDocument | ShippingLineDocument;
type UIColumn = import('@wcpos/hooks/src/use-store').UIColumn;
type Cart = Array<LineItemDocument | FeeLineDocument | ShippingLineDocument>;

interface ICartTableProps {
	ui: any;
}

const CartTable = ({ ui }: ICartTableProps) => {
	const columns = useObservableState(ui.get$('columns'), ui.get('columns')) as UIColumn[];
	const cart = useCart();
	const items = React.useMemo(() => flatten(Object.values(cart)), [cart]); // @TODO - add sorting

	/**
	 *
	 */
	const cellRenderer = React.useCallback<CellRenderer<CartItem>>(({ item, column, index }) => {
		const Cell = get(cells, [item.collection.name, column.key]);

		if (Cell) {
			return <Cell item={item} column={column} index={index} />;
		}

		if (item[column.key]) {
			return <Text>{item[column.key]}</Text>;
		}

		return null;
	}, []);

	/**
	 *
	 */
	const headerLabel = React.useCallback(({ column }) => {
		switch (column.key) {
			case 'quantity':
				return t('Qty');
			case 'name':
				return t('Name');
			case 'price':
				return t('Price');
			case 'total':
				return t('Total');
			case 'subtotal':
				return t('Subtotal');
			default:
				return column.key;
		}
	}, []);

	/**
	 *
	 */
	const context = React.useMemo<TableExtraDataProps<CartItem>>(() => {
		return {
			columns: columns.filter((column) => column.show),
			// sort: ({ sortBy, sortDirection }) => {
			// 	setQuery('sortBy', sortBy);
			// 	setQuery('sortDirection', sortDirection);
			// },
			// sortBy: query.sortBy,
			// sortDirection: query.sortDirection,
			cellRenderer,
			headerLabel,
		};
	}, [columns, cellRenderer, headerLabel]);

	/**
	 *
	 */
	useWhyDidYouUpdate('CartTable', { ui, columns, items, cart, t, context });

	/**
	 *
	 */
	return <Table<CartItem> data={items} estimatedItemSize={46} extraData={context} />;
};

export default CartTable;
