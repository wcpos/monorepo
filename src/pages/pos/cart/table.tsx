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

	const items$ = useObservable(
		(inputs$) => {
			// @ts-ignore
			const [q, o] = inputs$.getValue();
			console.log(o.id); // this is not being executed on change of order???

			// move this to an OrderDocument method
			const lineItems$: Observable<OrderLineItemDocument[]> = o.line_items$.pipe(
				switchMap((ids) => {
					return from(o.collections().line_items.findByIds(ids || []));
				}),
				map((result: Map<string, OrderLineItemDocument>) => {
					return Array.from(result.values());
				}),
				tap((res) => console.log(res)),
				catchError((err) => {
					console.error(err);
					return err;
				})
			);

			const feeLines$: Observable<OrderFeeLineDocument[]> = o.fee_lines$.pipe(
				switchMap((ids) => {
					return from(o.collections().fee_lines.findByIds(ids || []));
				}),
				map((result: Map<string, OrderFeeLineDocument>) => {
					return Array.from(result.values());
				}),
				catchError((err) => {
					console.error(err);
					return err;
				})
			);

			const shippingLines$: Observable<OrderShippingLineDocument[]> = o.shipping_lines$.pipe(
				switchMap((ids) => {
					return from(o.collections().shipping_lines.findByIds(ids || []));
				}),
				map((result: Map<string, OrderShippingLineDocument>) => {
					return Array.from(result.values());
				}),
				catchError((err) => {
					console.error(err);
					return err;
				})
			);

			return combineLatest([lineItems$, feeLines$, shippingLines$]).pipe(
				map(([lineItems, feeLines, shippingLines]) => {
					const sortedLineItems = orderBy(lineItems, q.sortBy, q.sortDirection);
					const sortedFeeLines = orderBy(feeLines, q.sortBy, q.sortDirection);
					const sortedShippingLines = orderBy(shippingLines, q.sortBy, q.sortDirection);
					// @ts-ignore
					return sortedLineItems.concat(sortedFeeLines, sortedShippingLines) as Array<
						OrderLineItemDocument | OrderFeeLineDocument | OrderShippingLineDocument
					>;
				})
			);
		},
		[query, order]
	);

	// const [items] = useObservableState(() => items$, []);
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
