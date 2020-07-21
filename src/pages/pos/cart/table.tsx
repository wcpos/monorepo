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

	const items$ = combineLatest(lineItems$, feeLines$).pipe(
		map(([lineItems, feeLines]) => {
			// sort line items

			// sort fee lines

			// merge
			return lineItems.concat(feeLines);
		})
	);

	// const lineItems$ = order.line_items$.pipe(
	// 	switchMap((ids) => from(order.collections().line_items.findByIds(ids))),
	// 	map((result) => Array.from(result.values())),
	// 	// sort in memory
	// 	map((result) => sortBy(result, query.sortBy)),
	// 	switchMap((array) => combineLatest(array.map((item) => item.$.pipe(map(() => item))))),
	// 	catchError((err) => console.error(err))
	// );

	const [items] = useObservableState(() => items$, []);

	const renderCell = ({ getCellProps }) => {
		const { cellData, column, rowData } = getCellProps();
		let children;

		switch (column.key) {
			case 'quantity':
				children = (
					<TextInput
						value={cellData}
						onChangeText={async (val) => {
							rowData.update({
								$set: {
									quantity: Number(val),
								},
							});
						}}
					/>
				);
				break;
			case 'total':
				children = <Text>{rowData.total}</Text>;
				break;
			case 'actions':
				children = (
					<Button
						title="x"
						onPress={() => {
							order.removeLineItem(rowData);
						}}
					/>
				);
				break;

			default:
				children = <Text>{String(cellData)}</Text>;
		}
		return <Table.Row.Cell {...getCellProps()}>{children}</Table.Row.Cell>;
	};

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
				{({ item }) => {
					// @TODO - try separating this and using item.$ observable
					return (
						<Table.Row rowData={item} columns={columns}>
							{renderCell}
						</Table.Row>
					);
				}}
			</Table.Body>
		</Table>
	);
};

export default CartTable;
