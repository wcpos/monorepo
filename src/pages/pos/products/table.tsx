import React from 'react';
import { useTranslation } from 'react-i18next';
import Table from '../../../components/table';
import Text from '../../../components/text';
import Actions from './cells/actions';

interface Props {
	columns: any;
	products: any;
}

/**
 *
 */
const ProductsTable: React.FC<Props> = ({ columns, products, sort }) => {
	const { t } = useTranslation();

	const onAddToCart = (product) => {
		console.log(product);
	};

	const renderCell = ({ getCellProps }) => {
		const { cellData, column, rowData } = getCellProps();
		let children;

		switch (column.key) {
			case 'actions':
				children = <Actions product={rowData} addToCart={onAddToCart} />;
				break;
			default:
				children = <Text>{String(cellData)}</Text>;
		}
		return <Table.Row.Cell {...getCellProps()}>{children}</Table.Row.Cell>;
	};

	return (
		<Table columns={columns} data={products} sort={sort}>
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
						{renderCell}
					</Table.Row>
				)}
			</Table.Body>
		</Table>
	);
};

export default ProductsTable;
