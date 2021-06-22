import * as React from 'react';
import { useObservableState, useObservable, useObservableSuspense } from 'observable-hooks';
import { useTranslation } from 'react-i18next';
import forEach from 'lodash/forEach';
import Table from '@wcpos/common/src/components/table';
import useWhyDidYouUpdate from '@wcpos/common/src/hooks/use-why-did-you-update';
import Row from './rows';

type Sort = import('@wcpos/common/src/components/table/types').Sort;
type SortDirection = import('@wcpos/common/src/components/table/types').SortDirection;

interface ICustomersTableProps {
	columns: any;
	customers$: any;
	setQuery: any;
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
	customers$,
	setQuery,
	sortBy: _sortBy,
	sortDirection: _sortDirection,
}: ICustomersTableProps) => {
	const { t } = useTranslation();
	const customers = useObservableState(customers$, []);
	const syncingCustomers = React.useRef<number[]>([]);

	const handleSort: Sort = React.useCallback(
		({ sortBy, sortDirection }) => {
			// @ts-ignore
			setQuery((prev) => ({ ...prev, sortBy, sortDirection }));
		},
		[setQuery]
	);

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

	const getItemLayout = React.useCallback(
		(data, index) => ({ length: 100, offset: 100 * index, index }),
		[]
	);

	useWhyDidYouUpdate('Customers Page Table', {
		columns,
		customers,
		setQuery,
		_sortBy,
		_sortDirection,
		syncingCustomers,
		t,
	});

	return (
		<Table
			columns={columns}
			data={customers}
			sort={handleSort}
			sortBy={_sortBy}
			sortDirection={_sortDirection}
			// @ts-ignore
			onViewableItemsChanged={handleVieweableItemsChanged}
			// @ts-ignore
			getItemLayout={getItemLayout}
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

export default React.memo(CustomersTable);
