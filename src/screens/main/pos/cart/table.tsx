import * as React from 'react';

import { useObservableEagerState, useObservableState } from 'observable-hooks';
import { map } from 'rxjs/operators';

import ErrorBoundary from '@wcpos/components/src/error-boundary';
import Table, { TableContextProps } from '@wcpos/components/src/table';

import { FeeLineRow } from './rows/fee-line';
import { LineItemRow } from './rows/line-item';
import { ShippingLineRow } from './rows/shipping-line';
import { useT } from '../../../../contexts/translations';
import EmptyTableRow from '../../components/empty-table-row';
import useUI from '../../contexts/ui-settings';
import { useCurrentOrder } from '../contexts/current-order';

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
const CartTable = () => {
	const { uiSettings } = useUI('pos.cart');
	const columns = useObservableState(
		uiSettings.get$('columns'),
		uiSettings.get('columns')
	) as UISettingsColumn[];
	const t = useT();
	const { currentOrder } = useCurrentOrder();

	/**
	 *
	 */
	const lineItems = useObservableEagerState(currentOrder.line_items$);
	const feeLines = useObservableEagerState(currentOrder.fee_lines$);
	const shippingLines = useObservableEagerState(currentOrder.shipping_lines$);

	const items = Array.isArray(lineItems)
		? lineItems.map((item) => {
				const uuidMetaData = item.meta_data.find((meta) => meta.key === '_woocommerce_pos_uuid');
				if (uuidMetaData && uuidMetaData.value) {
					return { ...item, uuid: uuidMetaData.value, type: 'line_items' };
				}
			})
		: [];

	const fees = Array.isArray(feeLines)
		? feeLines.map((item) => {
				const uuidMetaData = item.meta_data.find((meta) => meta.key === '_woocommerce_pos_uuid');
				if (uuidMetaData && uuidMetaData.value) {
					return { ...item, uuid: uuidMetaData.value, type: 'fee_lines' };
				}
			})
		: [];

	const shipping = Array.isArray(shippingLines)
		? shippingLines.map((item) => {
				const uuidMetaData = item.meta_data.find((meta) => meta.key === '_woocommerce_pos_uuid');
				if (uuidMetaData && uuidMetaData.value) {
					return { ...item, uuid: uuidMetaData.value, type: 'shipping_lines' };
				}
			})
		: [];

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
				<Component {...props} />
			</ErrorBoundary>
		);
	}, []);

	/**
	 *
	 */
	return (
		<Table<CartItem>
			data={items.concat(fees).concat(shipping)} // estimatedItemSize={46}
			renderItem={renderItem}
			context={context}
			ListEmptyComponent={<EmptyTableRow message={t('Cart is empty', { _tags: 'core' })} />}
		/>
	);
};

// export default React.memo(CartTable);
export default CartTable;
