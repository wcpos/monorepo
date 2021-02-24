import * as React from 'react';
import { useObservable, useObservableState } from 'observable-hooks';
import { from, of, combineLatest, zip, Observable } from 'rxjs';
import { switchMap, tap, catchError, map } from 'rxjs/operators';
import { useTranslation } from 'react-i18next';
import orderBy from 'lodash/orderBy';
import Table from '../../../components/table';
import Text from '../../../components/text';
import TextInput from '../../../components/textinput';
import Button from '../../../components/button';
import LineItem from './rows/line-item';
import FeeLine from './rows/fee-line';
import ShippingLine from './rows/shipping-line';

type ColumnProps = import('../../../components/table/types').ColumnProps;
type Sort = import('../../../components/table/types').Sort;
type SortDirection = import('../../../components/table/types').SortDirection;
type GetHeaderCellPropsFunction = import('../../../components/table/header-row').GetHeaderCellPropsFunction;
type OrderDocument = import('../../../database/types').OrderDocument;
type OrderLineItemDocument = import('../../../database/types').OrderLineItemDocument;
type OrderFeeLineDocument = import('../../../database/types').OrderFeeLineDocument;
type OrderShippingLineDocument = import('../../../database/types').OrderShippingLineDocument;

interface ICartTableProps {
	columns: ColumnProps[];
	order: OrderDocument;
	query: any;
	onSort: Sort;
}

const CartTable = ({ columns, order, query, onSort }: ICartTableProps) => {
	const { t } = useTranslation();
	console.log(order.id);

	const items$ = useObservable((inputs$) => inputs$.pipe(switchMap(([o, q]) => o.getCart$(q))), [
		order,
		query,
	]) as Observable<any[]>;

	const items = useObservableState(items$, []);

	return (
		<Table
			columns={columns}
			data={items}
			sort={onSort}
			sortBy={query.sortBy}
			sortDirection={query.sortDirection}
		>
			<Table.Header>
				<Table.HeaderRow columns={columns}>
					{({ getHeaderCellProps }: { getHeaderCellProps: GetHeaderCellPropsFunction }) => {
						const { column } = getHeaderCellProps();
						return (
							<Table.HeaderRow.HeaderCell {...getHeaderCellProps()}>
								{t(`cart.column.label.${column.key}`)}
							</Table.HeaderRow.HeaderCell>
						);
					}}
				</Table.HeaderRow>
			</Table.Header>
			<Table.Body>
				{({ item }: { item: any }): React.ReactElement | null => {
					switch (item.collection.name) {
						case 'line_items':
							return <LineItem order={order} item={item} columns={columns} />;
						case 'fee_lines':
							return <FeeLine order={order} fee={item} columns={columns} />;
						case 'shipping_lines':
							return <ShippingLine order={order} shipping={item} columns={columns} />;
						default:
							return null;
					}
				}}
			</Table.Body>
		</Table>
	);
};

export default CartTable;
