import React from 'react';
import { useObservable, useObservableState } from 'observable-hooks';
import { from, of, combineLatest } from 'rxjs';
import { switchMap, tap, catchError, map } from 'rxjs/operators';
import { useTranslation } from 'react-i18next';
import Table from '../../../components/table';
import Text from '../../../components/text';
import TextInput from '../../../components/textinput';

const CartTable = ({ columns, order }) => {
	const { t } = useTranslation();

	const lineItems$ = order.line_items$.pipe(
		switchMap((ids) => from(order.collections().line_items.findByIds(ids))),
		map((result) => Array.from(result.values())),
		switchMap((array) => combineLatest(array.map((item) => item.$.pipe(map(() => item))))),
		tap((res) => console.log(res)),
		catchError((err) => console.error(err))
	);

	const [lineItems] = useObservableState(() => lineItems$, []);

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
			default:
				children = <Text>{String(cellData)}</Text>;
		}
		return <Table.Row.Cell {...getCellProps()}>{children}</Table.Row.Cell>;
	};

	return (
		<Table columns={columns} data={lineItems}>
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
