import * as React from 'react';
import { useObservableState, useObservableSuspense, ObservableResource } from 'observable-hooks';
import { useTranslation } from 'react-i18next';
import flatten from 'lodash/flatten';
import get from 'lodash/get';
import Table, { TableExtraDataProps, CellRenderer } from '@wcpos/components/src/table';
import Text from '@wcpos/components/src/text';
import useWhyDidYouUpdate from '@wcpos/hooks/src/use-why-did-you-update';
import { usePOSContext } from '../context';
import * as cells from './cells';

type ColumnProps = import('@wcpos/components/src/table').ColumnProps;
type Sort = import('@wcpos/components/src/table').Sort;
type SortDirection = import('@wcpos/components/src/table').SortDirection;
type OrderDocument = import('@wcpos/database').OrderDocument;
type LineItemDocument = import('@wcpos/database').LineItemDocument;
type FeeLineDocument = import('@wcpos/database').FeeLineDocument;
type ShippingLineDocument = import('@wcpos/database').ShippingLineDocument;
type CartItem = LineItemDocument | FeeLineDocument | ShippingLineDocument;
type UIColumn = import('@wcpos/hooks/src/use-ui-resource').UIColumn;
type Cart = Array<LineItemDocument | FeeLineDocument | ShippingLineDocument>;

interface ICartTableProps {
	cartResource: ObservableResource<{
		line_items: LineItemDocument[];
		fee_lines: FeeLineDocument[];
		shipping_lines: ShippingLineDocument[];
	}>;
	ui: any;
}

const CartTable = ({ cartResource, ui }: ICartTableProps) => {
	const { t } = useTranslation();
	const columns = useObservableState(ui.get$('columns'), ui.get('columns')) as UIColumn[];
	const cart = useObservableSuspense(cartResource);
	const items = React.useMemo(() => flatten(Object.values(cart)), [cart]); // @TODO - add sorting
	const { setCurrentOrder } = usePOSContext();

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
	const headerLabel = React.useCallback(
		({ column }) => {
			return t(`pos.cart.column.label.${column.key}`);
		},
		[t]
	);

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
	useWhyDidYouUpdate('CartTable', { cartResource, ui, columns, items, cart, t, context });

	/**
	 *
	 */
	return <Table<CartItem> data={items} estimatedItemSize={46} extraData={context} />;
};

export default CartTable;
