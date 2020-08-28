import React from 'react';
import { useTranslation } from 'react-i18next';
import { useObservableState, useObservable } from 'observable-hooks';
import Table from '../../../components/table';
import Text from '../../../components/text';
import Row from './rows';

interface Props {
	columns: any;
	products: any;
	sort: () => void;
	sortBy: string;
	sortDirection: string;
}

/**
 *
 */
const ProductsTable = ({ columns, products }: Props) => {
	const { t } = useTranslation();

	return (
		<Table
			columns={columns}
			data={products}
			// sort={sort}
			// sortBy={sortBy}
			// sortDirection={sortDirection}
		>
			<Table.Header>
				<Table.HeaderRow>
					{({ getHeaderCellProps }) => {
						const { column } = getHeaderCellProps();
						return (
							<Table.HeaderRow.HeaderCell {...getHeaderCellProps()}>
								{t(`products.column.label.${column.key}`)}
							</Table.HeaderRow.HeaderCell>
						);
					}}
				</Table.HeaderRow>
			</Table.Header>
			<Table.Body>{({ item }) => <Row product={item} columns={columns} />}</Table.Body>
		</Table>
	);
};

export default ProductsTable;
