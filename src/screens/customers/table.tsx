import * as React from 'react';
import { useObservableState, useObservableSuspense } from 'observable-hooks';
import { useTranslation } from 'react-i18next';
import get from 'lodash/get';
import useCustomers from '@wcpos/hooks/src/use-customers';
import useWhyDidYouUpdate from '@wcpos/hooks/src/use-why-did-you-update';
import Table from '@wcpos/components/src/table';
import Actions from './cells/actions';
import Name from './cells/name';
import Email from './cells/email';
import Address from './cells/address';
import Avatar from './cells/avatar';
import Footer from './footer';

type Sort = import('@wcpos/components/src/table/table').Sort;
type SortDirection = import('@wcpos/components/src/table/table').SortDirection;
type CustomerDocument = import('@wcpos/database').CustomerDocument;
type ColumnProps = import('@wcpos/components/src/table/table').ColumnProps<CustomerDocument>;
type UIColumn = import('@wcpos/hooks/src/use-ui-resource').UIColumn;

interface CustomersTableProps {
	ui: import('@wcpos/hooks/src/use-ui-resource').UIDocument;
}

const cells = {
	avatar_url: Avatar,
	first_name: Name,
	last_name: Name,
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
	const { query$, setQuery, resource } = useCustomers();
	const query = useObservableState(query$, query$.getValue());
	const data = useObservableSuspense(resource);
	const columns = useObservableState(ui.get$('columns'), ui.get('columns')) as UIColumn[];

	/**
	 * - filter visible columns
	 * - translate column label
	 * - asssign cell renderer
	 */
	const visibleColumns = React.useMemo(
		() =>
			columns
				.filter((column) => column.show)
				.map((column) => {
					// clone column and add label, onRender function
					const Cell = get(cells, column.key);

					return {
						...column,
						label: t(`customers.column.label.${column.key}`),
					};
				}),
		[columns, t]
	);

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
					itemIndex={index}
				/>
			);
		},
		[cellRenderer, visibleColumns]
	);

	useWhyDidYouUpdate('Table', { data });

	return (
		<Table<CustomerDocument>
			columns={visibleColumns}
			data={data}
			sort={handleSort}
			sortBy={query.sortBy}
			sortDirection={query.sortDirection}
			footer={<Footer count={data.length} />}
			rowRenderer={rowRenderer}
		/>
	);
};

export default CustomersTable;
