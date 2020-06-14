import React from 'react';
import { useTranslation } from 'react-i18next';
import Table from '../../components/table';

interface Props {
	columnsResource: any;
	products: any;
}

/**
 *
 */
const ProductsTable: React.FC<Props> = ({ columns, uiReset, products }) => {
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
						{({ cellData, column }) => <Table.Row.Cell cellData={cellData} columnData={column} />}
					</Table.Row>
				)}
			</Table.Body>
		</Table>
	);
};

export default ProductsTable;
