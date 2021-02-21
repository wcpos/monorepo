import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { useObservableState, useObservable } from 'observable-hooks';
import Table from '../../../components/table';
import Text from '../../../components/text';
import Row from './rows';

type Sort = import('../../../components/table/types').Sort;
type SortDirection = import('../../../components/table/types').SortDirection;
type GetHeaderCellPropsFunction = import('../../../components/table/header-row').GetHeaderCellPropsFunction;

interface Props {
	columns: any;
	products: any;
	sort?: Sort;
	sortBy?: string;
	sortDirection?: SortDirection;
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
					{({ getHeaderCellProps }: { getHeaderCellProps: GetHeaderCellPropsFunction }) => {
						const { column } = getHeaderCellProps();
						return (
							<Table.HeaderRow.HeaderCell {...getHeaderCellProps()}>
								{t(`products.column.label.${column.key}`)}
							</Table.HeaderRow.HeaderCell>
						);
					}}
				</Table.HeaderRow>
			</Table.Header>
			<Table.Body>
				{({ item }: { item: any }) => <Row product={item} columns={columns} />}
			</Table.Body>
		</Table>
	);
};

export default ProductsTable;
