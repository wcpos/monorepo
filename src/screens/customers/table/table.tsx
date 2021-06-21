import * as React from 'react';
import { useTranslation } from 'react-i18next';
import forEach from 'lodash/forEach';
import Table from '@wcpos/common/src/components/table';
import Row from './rows';

type Sort = import('@wcpos/common/src/components/table/types').Sort;
type SortDirection = import('@wcpos/common/src/components/table/types').SortDirection;

interface ICustomersTableProps {
	columns: any;
	customers: any;
	sort: Sort;
	sortBy: string;
	sortDirection: SortDirection;
}

type GetHeaderCellPropsFunction =
	import('@wcpos/common/src/components/table/header-row').GetHeaderCellPropsFunction;

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
	const syncingCustomers = React.useRef<number[]>([]);

	const handleVieweableItemsChanged = React.useCallback(({ changed }) => {
		forEach(changed, ({ item, isViewable }) => {
			if (isViewable && !item.isSynced() && !syncingCustomers.current.includes(item.id)) {
				syncingCustomers.current.push(item.id);
				const replicationState = item.syncRestApi({
					pull: {},
				});
				replicationState.run(false);
			}
		});
	}, []);

	return (
		<Table
			columns={columns}
			data={customers}
			sort={sort}
			sortBy={sortBy}
			sortDirection={sortDirection}
			// @ts-ignore
			onViewableItemsChanged={handleVieweableItemsChanged}
		>
			<Table.Header>
				<Table.Header.Row>
					{({ getHeaderCellProps }: { getHeaderCellProps: GetHeaderCellPropsFunction }) => {
						const { column } = getHeaderCellProps();
						return (
							<Table.Header.Row.Cell {...getHeaderCellProps()}>
								{t(`customers.column.label.${column.key}`)}
							</Table.Header.Row.Cell>
						);
					}}
				</Table.Header.Row>
			</Table.Header>
			<Table.Body>
				{({ item }: { item: any }) => <Row customer={item} columns={columns} />}
			</Table.Body>
		</Table>
	);
};

export default CustomersTable;
