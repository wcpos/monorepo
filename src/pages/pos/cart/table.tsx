import React from 'react';
import { useObservable, useObservableState } from 'observable-hooks';
import { from, of, combineLatest, zip } from 'rxjs';
import { switchMap, tap, catchError, map } from 'rxjs/operators';
import { useTranslation } from 'react-i18next';
import sortBy from 'lodash/sortBy';
import Table from '../../../components/table';
import Text from '../../../components/text';
import TextInput from '../../../components/textinput';
import Button from '../../../components/button';
import LineItem from './rows/line-item';
import FeeLine from './rows/fee-line';
import ShippingLine from './rows/shipping-line';

const CartTable = ({ columns, order }) => {
	const { t } = useTranslation();
	const [query, setQuery] = React.useState({
		sortBy: 'id',
		sortDirection: 'asc',
	});

	const lineItems$ = order.line_items$.pipe(
		switchMap((ids) => from(order.collections().line_items.findByIds(ids))),
		map((result) => Array.from(result.values())),
		catchError((err) => console.error(err))
	);

	const feeLines$ = order.fee_lines$.pipe(
		switchMap((ids) => from(order.collections().fee_lines.findByIds(ids))),
		map((result) => Array.from(result.values())),
		catchError((err) => console.error(err))
	);

	const shippingLines$ = order.shipping_lines$.pipe(
		switchMap((ids) => from(order.collections().shipping_lines.findByIds(ids))),
		map((result) => Array.from(result.values())),
		catchError((err) => console.error(err))
	);

	const items$ = combineLatest(lineItems$, feeLines$, shippingLines$).pipe(
		map(([lineItems, feeLines, shippingLines]) => {
			// sort line items

			// sort fee lines

			// merge
			return lineItems.concat(feeLines, shippingLines);
		})
	);

	const [items] = useObservableState(() => items$, []);

	const onSort = ({ sortBy, sortDirection }) => {
		console.log({ sortBy, sortDirection });
		setQuery({ ...query, sortBy, sortDirection });
	};

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
					{({ getHeaderCellProps }) => {
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
				{({ item }): React.ReactElement | null => {
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
