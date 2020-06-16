import React from 'react';
import { useTranslation } from 'react-i18next';
import Table from '../../components/table';
import Text from '../../components/text';

interface Props {
	columns: any;
	products: any;
}

/**
 *
 */
const ProductsTable: React.FC<Props> = ({ columns, products }) => {
	const { t } = useTranslation();

	return (
		<Table columns={columns} data={products}>
			<Table.Header>
				<Table.HeaderRow>
					{columns.map((column) => {
						return (
							<Table.HeaderRow.HeaderCell>
								{t(`products.column.label.${column.key}`)}
							</Table.HeaderRow.HeaderCell>
						);
					})}
				</Table.HeaderRow>
			</Table.Header>
			<Table.Body>
				{({ item }) => (
					<Table.Row rowData={item} columns={columns}>
						{({ cellData, column, getCellProps }) => (
							<Table.Row.Cell {...getCellProps()}>
								<Text>{String(cellData)}</Text>
							</Table.Row.Cell>
						)}
					</Table.Row>
				)}
			</Table.Body>
		</Table>
	);
};

export default ProductsTable;
