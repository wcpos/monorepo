import React from 'react';
import { useObservable, useObservableState } from 'observable-hooks';
import { from } from 'rxjs';
import { switchMap, tap, catchError, map } from 'rxjs/operators';
import { useTranslation } from 'react-i18next';
import Table from '../../../components/table';
import Text from '../../../components/text';

const CartTable = ({ columns, order }) => {
	const { t } = useTranslation();

	const lineItems$ = useObservable(() =>
		order.line_items$.pipe(
			switchMap((ids) => from(order.collections().line_items.findByIds(ids))),
			map((result) => Array.from(result.values())),
			catchError((err) => console.error(err))
		)
	);

	const lineItems = useObservableState(lineItems$, []);

	const renderCell = ({ getCellProps }) => {
		const { cellData, column, rowData } = getCellProps();
		let children;

		switch (column.key) {
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
				{({ item }) => (
					<Table.Row rowData={item} columns={columns}>
						{renderCell}
					</Table.Row>
				)}
			</Table.Body>
		</Table>
	);
};

export default CartTable;
