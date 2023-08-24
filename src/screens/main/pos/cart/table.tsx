import * as React from 'react';

import flatten from 'lodash/flatten';
import { useObservableState, useObservableSuspense } from 'observable-hooks';

import ErrorBoundary from '@wcpos/components/src/error-boundary';
import Table, { TableContextProps } from '@wcpos/components/src/table';

import { FeeLineRow } from './rows/fee-line';
import { LineItemRow } from './rows/line-item';
import { ShippingLineRow } from './rows/shipping-line';
import { t } from '../../../../lib/translations';
import EmptyTableRow from '../../components/empty-table-row';
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

const TABLE_ROW_COMPONENTS = {
	line_items: LineItemRow,
	fee_lines: FeeLineRow,
	shipping_lines: ShippingLineRow,
};

/**
 *
 */
const CartTable = ({ resource }) => {
	const { uiSettings } = useUI('pos.cart');
	const columns = useObservableState(
		uiSettings.get$('columns'),
		uiSettings.get('columns')
	) as UISettingsColumn[];
	const cart = useObservableSuspense(resource);
	const deferredCart = React.useDeferredValue(cart);
	// TODO - add sorting
	const items = React.useMemo(() => flatten(Object.values(deferredCart)), [deferredCart]);

	/**
	 *
	 */
	// const cellRenderer = React.useCallback<CellRenderer<CartItem>>(({ item, column, index }) => {
	// 	const Cell = get(cells, [item.collection.name, column.key]);

	// 	if (Cell) {
	// 		return <Cell item={item} column={column} index={index} />;
	// 	}

	// 	if (item[column.key]) {
	// 		return <Text>{item[column.key]}</Text>;
	// 	}

	// 	return null;
	// }, []);

	/**
	 *
	 */
	const context = React.useMemo<TableContextProps<CartItem>>(() => {
		return {
			columns: columns.filter((column) => column.show),
			// sort: ({ sortBy, sortDirection }) => {
			// 	setQuery('sortBy', sortBy);
			// 	setQuery('sortDirection', sortDirection);
			// },
			// sortBy: query.sortBy,
			// sortDirection: query.sortDirection,
			headerLabel: ({ column }) => uiSettings.getLabel(column.key),
		};
	}, [columns, uiSettings]);

	/**
	 *
	 */
	const renderItem = React.useCallback((props) => {
		let Component = TABLE_ROW_COMPONENTS[props.item.collection.name];

		// If we still didn't find a component, use LineItemRow
		if (!Component) {
			Component = LineItemRow;
		}

		return (
			<ErrorBoundary>
				<Component {...props} />
			</ErrorBoundary>
		);
	}, []);

	/**
	 *
	 */
	return (
		<Table<CartItem>
			data={items} // estimatedItemSize={46}
			renderItem={renderItem}
			context={context}
			ListEmptyComponent={<EmptyTableRow message={t('Cart is empty', { _tags: 'core' })} />}
		/>
	);
};

// export default React.memo(CartTable);
export default CartTable;
