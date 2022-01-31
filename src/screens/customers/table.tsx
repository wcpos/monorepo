import * as React from 'react';
import { useObservableState } from 'observable-hooks';
import { useTranslation } from 'react-i18next';
import orderBy from 'lodash/orderBy';
import get from 'lodash/get';
import useData from '@wcpos/common/src/hooks/use-collection-query';
import useQuery from '@wcpos/common/src/hooks/use-query';
import useWhyDidYouUpdate from '@wcpos/common/src/hooks/use-why-did-you-update';
import Table from '@wcpos/common/src/components/table3';
import useRestQuery from '@wcpos/common/src/hooks/use-rest-query-customers';
import Actions from './cells/actions';
import Name from './cells/name';
import Email from './cells/email';
import Address from './cells/address';
import Avatar from './cells/avatar';
import Footer from './footer';

type Sort = import('@wcpos/common/src/components/table/types').Sort;
type SortDirection = import('@wcpos/common/src/components/table/types').SortDirection;
type CustomerDocument = import('@wcpos/common/src/database').CustomerDocument;
type ColumnProps =
	import('@wcpos/common/src/components/table3/table').ColumnProps<CustomerDocument>;
type UIColumn = import('@wcpos/common/src/hooks/use-ui-resource').UIColumn;

interface CustomersTableProps {
	ui: import('@wcpos/common/src/hooks/use-ui-resource').UIDocument;
}

const cells = {
	avatarUrl: Avatar,
	firstName: Name,
	lastName: Name,
	email: Email,
	billing: Address,
	shipping: Address,
	actions: Actions,
};

/**
 *
 */
const CustomersTable = ({ ui }: CustomersTableProps) => {
	const { t } = useTranslation();
	const { data } = useData('customers');
	const { query, setQuery } = useQuery();
	const columns = useObservableState(ui.get$('columns'), ui.get('columns')) as UIColumn[];
	useRestQuery('customers');

	/**
	 * - filter visible columns
	 * - translate column label
	 * - asssign cell renderer
	 */
	const visibleColumns = React.useMemo(
		() =>
			columns
				.filter((column) => !column.hide)
				.map((column) => {
					// clone column and add label, onRender function
					const Cell = get(cells, column.key);

					return {
						...column,
						label: t(`customers.column.label.${column.key}`),
						onRender: (item: CustomerDocument) => {
							return Cell ? <Cell item={item} column={column} /> : null;
						},
					};
				}),
		[columns, t]
	);

	/**
	 * in memory sort
	 */
	const sortedData = React.useMemo(() => {
		return orderBy(data, [query.sortBy], [query.sortDirection]);
	}, [data, query.sortBy, query.sortDirection]);

	/**
	 * handle sort
	 */
	const handleSort: Sort = React.useCallback(
		({ sortBy, sortDirection }) => {
			setQuery('sortBy', sortBy);
			setQuery('sortDirection', sortDirection);
		},
		[setQuery]
	);

	/**
	 *
	 */
	const cellRenderer = React.useCallback((item: CustomerDocument, column: ColumnProps) => {
		const Cell = get(cells, column.key);
		return Cell ? <Cell item={item} column={column} /> : null;
	}, []);

	/**
	 *
	 */
	const rowRenderer = React.useCallback(
		(
			item,
			index
			// renderContext: TableRowRenderContext<T>,
		) => {
			// subscribe to item, special case to trigger render for data changes
			// @TODO: find a better way to do this
			// @ts-ignore
			// const forceRender = useObservableState(item.$);

			return (
				<Table.Row
					// config={renderContext}
					item={item}
					// @ts-ignore
					columns={visibleColumns}
					// itemIndex={index}
					cellRenderer={cellRenderer}
				/>
			);
		},
		[visibleColumns]
	);

	useWhyDidYouUpdate('Table', { data });

	return (
		<Table<CustomerDocument>
			columns={visibleColumns}
			data={sortedData}
			sort={handleSort}
			sortBy={query.sortBy}
			sortDirection={query.sortDirection}
			footer={<Footer count={data.length} />}
			rowRenderer={rowRenderer}
		/>
	);
};

export default CustomersTable;
