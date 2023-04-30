import * as React from 'react';

import flatten from 'lodash/flatten';
import get from 'lodash/get';
import { useObservableState } from 'observable-hooks';

import Table, { TableExtraDataProps, CellRenderer } from '@wcpos/components/src/table';
import Text from '@wcpos/components/src/text';

import * as cells from './cells';
import { t } from '../../../../lib/translations';
import EmptyTableRow from '../../components/empty-table-row';
import { useSuspenedCart } from '../../contexts/cart';
import useUI from '../../contexts/ui-settings';

type ColumnProps = import('@wcpos/components/src/table').ColumnProps;
type Sort = import('@wcpos/components/src/table').Sort;
type SortDirection = import('@wcpos/components/src/table').SortDirection;
type OrderDocument = import('@wcpos/database').OrderDocument;
type LineItemDocument = import('@wcpos/database').LineItemDocument;
type FeeLineDocument = import('@wcpos/database').FeeLineDocument;
type ShippingLineDocument = import('@wcpos/database').ShippingLineDocument;
type CartItem = LineItemDocument | FeeLineDocument | ShippingLineDocument;
type UISettingsColumn = import('../../contexts/ui-settings').UISettingsColumn;
type Cart = (LineItemDocument | FeeLineDocument | ShippingLineDocument)[];

/**
 *
 */
const CartTable = () => {
	const { uiSettings } = useUI('pos.cart');
	const columns = useObservableState(
		uiSettings.get$('columns'),
		uiSettings.get('columns')
	) as UISettingsColumn[];
	const { data: cart } = useSuspenedCart();
	// const deferredCart = React.useDeferredValue(cart);
	const items = React.useMemo(() => flatten(Object.values(cart)), [cart]); // TODO - add sorting
	// const items = React.useDeferredValue(flatten(Object.values(cart)));

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
			headerLabel: ({ column }) => uiSettings.getLabel(column.key),
		};
	}, [columns, cellRenderer, uiSettings]);

	/**
	 *
	 */
	return (
		<Table<CartItem>
			data={items} // estimatedItemSize={46}
			extraData={context}
			ListEmptyComponent={<EmptyTableRow message={t('Cart is empty', { _tags: 'core' })} />}
		/>
	);
};

// export default React.memo(CartTable);
export default CartTable;
