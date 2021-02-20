import * as React from 'react';
import { useTranslation } from 'react-i18next';
import Table from '../../../components/table';
import Row from './rows';

type Sort = import('../../../components/table/types').Sort;
type SortDirection = import('../../../components/table/types').SortDirection;

interface ICustomersTableProps {
	columns: any;
	customers: any;
	sort: Sort;
	sortBy: string;
	sortDirection: SortDirection;
}

type GetHeaderCellPropsFunction = import('../../../components/table/header-row').GetHeaderCellPropsFunction;

/**
 *
 */
const CustomersTable = ({
	columns,
	customers,
	sort,
	sortBy,
	sortDirection,
}: ICustomersTableProps) => {
	const { t } = useTranslation();

	return (
		<Table
			columns={columns}
			data={customers}
			sort={sort}
			sortBy={sortBy}
			sortDirection={sortDirection}
		>
			<Table.Header>
				<Table.HeaderRow>
					{({ getHeaderCellProps }: { getHeaderCellProps: GetHeaderCellPropsFunction }) => {
						const { column } = getHeaderCellProps();
						return (
							<Table.HeaderRow.HeaderCell {...getHeaderCellProps()}>
								{t(`customers.column.label.${column.key}`)}
							</Table.HeaderRow.HeaderCell>
						);
					}}
				</Table.HeaderRow>
			</Table.Header>
			<Table.Body>
				{({ item }: { item: any }) => <Row customer={item} columns={columns} />}
			</Table.Body>
		</Table>
	);
};

export default CustomersTable;
