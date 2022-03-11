import * as React from 'react';
import { Observable } from 'rxjs';
import { useObservableState, useObservableSuspense, ObservableResource } from 'observable-hooks';
import { useTranslation } from 'react-i18next';
import orderBy from 'lodash/orderBy';
import flatten from 'lodash/flatten';
import Table from '@wcpos/common/src/components/table3';
import useWhyDidYouUpdate from '@wcpos/common/src/hooks/use-why-did-you-update';
import LineItem from './rows/line-item';
import FeeLine from './rows/fee-line';
import ShippingLine from './rows/shipping-line';
import { usePOSContext } from '../context';

type ColumnProps = import('@wcpos/common/src/components/table/types').ColumnProps;
type Sort = import('@wcpos/common/src/components/table/types').Sort;
type SortDirection = import('@wcpos/common/src/components/table/types').SortDirection;
type OrderDocument = import('@wcpos/common/src/database').OrderDocument;
type LineItemDocument = import('@wcpos/common/src/database').LineItemDocument;
type FeeLineDocument = import('@wcpos/common/src/database').FeeLineDocument;
type ShippingLineDocument = import('@wcpos/common/src/database').ShippingLineDocument;
type CartItem = LineItemDocument | FeeLineDocument | ShippingLineDocument;
type UIColumn = import('@wcpos/common/src/hooks/use-ui-resource').UIColumn;
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

	useWhyDidYouUpdate('CartTable', { cartResource, ui, columns, items, cart, t });

	/**
	 * If Cart Table is emptied, delete the order
	 */
	// React.useEffect(() => {
	// 	if (items.length === 0) {
	// 		order.remove().then(() => {
	// 			setCurrentOrder(null);
	// 		});
	// 	}
	// }, [items, order]);

	/**
	 * - filter visible columns
	 * - translate column label
	 */
	const visibleColumns = React.useMemo(() => {
		return columns
			.filter((column) => !column.hide)
			.map((column) => {
				// clone column and add label
				return {
					...column,
					label: t(`pos.cart.column.label.${column.key}`),
				};
			});
	}, [columns, t]);

	const [query, setQuery] = React.useState({
		sortBy: 'id',
		sortDirection: 'asc',
	});

	const handleSort = React.useCallback<Sort>(
		({ sortBy, sortDirection }) => {
			// @ts-ignore
			setQuery({ ...query, sortBy, sortDirection });
		},
		[query]
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
			switch (item.collection.name) {
				case 'line_items':
					return <LineItem lineItem={item} columns={visibleColumns} />;
				case 'fee_lines':
					return <FeeLine fee={item} columns={visibleColumns} />;
				case 'shipping_lines':
					return <ShippingLine shipping={item} columns={visibleColumns} />;
				default:
					return null;
			}
		},
		[visibleColumns]
	);

	return <Table<CartItem> data={items} columns={visibleColumns} rowRenderer={rowRenderer} />;
};

export default CartTable;
