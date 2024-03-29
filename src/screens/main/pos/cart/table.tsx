import * as React from 'react';

import { useObservableState } from 'observable-hooks';

import ErrorBoundary from '@wcpos/components/src/error-boundary';
import Table, { TableContextProps } from '@wcpos/components/src/table';

import { useCartLines, CartLine } from '../hooks/use-cart-lines';
import { FeeLineRow } from './rows/fee-line';
import { LineItemRow } from './rows/line-item';
import { ShippingLineRow } from './rows/shipping-line';
import { useT } from '../../../../contexts/translations';
import EmptyTableRow from '../../components/empty-table-row';
import useUI from '../../contexts/ui-settings';

type UISettingsColumn = import('../../contexts/ui-settings').UISettingsColumn;

const TABLE_ROW_COMPONENTS = {
	line_items: LineItemRow,
	fee_lines: FeeLineRow,
	shipping_lines: ShippingLineRow,
};

/**
 *
 */
const CartTable = () => {
	const { uiSettings } = useUI('pos.cart');
	const columns = useObservableState(
		uiSettings.get$('columns'),
		uiSettings.get('columns')
	) as UISettingsColumn[];
	const t = useT();
	const lines = useCartLines();

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
		let Component = TABLE_ROW_COMPONENTS[props.item.type];

		// If we still didn't find a component, use LineItemRow
		if (!Component) {
			Component = LineItemRow;
		}

		return (
			<ErrorBoundary>
				<Component index={props.index} {...props.item} />
			</ErrorBoundary>
		);
	}, []);

	/**
	 *
	 */
	return (
		<Table<CartLine>
			data={lines}
			// estimatedItemSize={46}
			renderItem={renderItem}
			context={context}
			ListEmptyComponent={<EmptyTableRow message={t('Cart is empty', { _tags: 'core' })} />}
		/>
	);
};

// export default React.memo(CartTable);
export default CartTable;
