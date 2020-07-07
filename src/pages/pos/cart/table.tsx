import React from 'react';
import { useTranslation } from 'react-i18next';
import Table from '../../../components/table';
import Text from '../../../components/text';

const CartTable = ({ columns, order }) => {
	const { t } = useTranslation();

	const renderCell = ({ getCellProps }) => {
		const { cellData, column, rowData } = getCellProps();
		let children;

		switch (column.key) {
			default:
				children = <Text>{String(cellData)}</Text>;
		}
		return <Table.Row.Cell {...getCellProps()}>{children}</Table.Row.Cell>;
	};

	return (
		<Table columns={columns} data={order.line_items}>
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
