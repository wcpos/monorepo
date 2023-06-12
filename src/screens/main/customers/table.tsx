import * as React from 'react';

import get from 'lodash/get';
import { useObservableState, useObservableSuspense } from 'observable-hooks';

import ErrorBoundary from '@wcpos/components/src/error-boundary';
import Table, { TableExtraDataProps, CellRenderer } from '@wcpos/components/src/table';

import cells from './cells';
import Footer from './footer';
import { t } from '../../../lib/translations';
import EmptyTableRow from '../components/empty-table-row';
import TextCell from '../components/text-cell';
import useCustomers from '../contexts/customers';
import useTotalCount from '../hooks/use-total-count';

type CustomerDocument = import('@wcpos/database').CustomerDocument;
type UISettingsColumn = import('../contexts/ui-settings').UISettingsColumn;

interface CustomersTableProps {
	uiSettings: import('../contexts/ui-settings').UISettingsDocument;
}

/**
 *
 */
const CustomersTable = ({ uiSettings }: CustomersTableProps) => {
	const { query$, setQuery, resource, replicationState, loadNextPage } = useCustomers();
	const { data, count, hasMore } = useObservableSuspense(resource);
	const loading = useObservableState(replicationState.active$, false);
	const query = useObservableState(query$, query$.getValue());
	const total = useTotalCount('customers', replicationState);
	const columns = useObservableState(
		uiSettings.get$('columns'),
		uiSettings.get('columns')
	) as UISettingsColumn[];

	/**
	 *
	 */
	const cellRenderer = React.useCallback<CellRenderer<CustomerDocument>>(
		({ item, column, index, cellWidth }) => {
			const Cell = get(cells, [column.key]);

			if (Cell) {
				return (
					<ErrorBoundary>
						<React.Suspense>
							<Cell item={item} column={column} index={index} cellWidth={cellWidth} />
						</React.Suspense>
					</ErrorBoundary>
				);
			}

			return <TextCell item={item} column={column} />;
		},
		[]
	);

	/**
	 *
	 */
	const context = React.useMemo<TableExtraDataProps<CustomerDocument>>(() => {
		return {
			columns: columns.filter((column) => column.show),
			sort: ({ sortBy, sortDirection }) => {
				setQuery('sortBy', sortBy);
				setQuery('sortDirection', sortDirection);
			},
			sortBy: query.sortBy,
			sortDirection: query.sortDirection,
			cellRenderer,
			headerLabel: ({ column }) => uiSettings.getLabel(column.key),
		};
	}, [columns, query.sortBy, query.sortDirection, cellRenderer, setQuery, uiSettings]);

	/**
	 *
	 */
	const onEndReached = React.useCallback(() => {
		if (hasMore) {
			loadNextPage();
		} else if (!loading && total > count) {
			replicationState.start({ fetchRemoteIDs: false });
		}
	}, [count, hasMore, loadNextPage, loading, replicationState, total]);

	/**
	 *
	 */
	return (
		<Table<CustomerDocument>
			data={data}
			footer={<Footer count={count} total={total} loading={loading} />}
			estimatedItemSize={100}
			extraData={context}
			ListEmptyComponent={<EmptyTableRow message={t('No customers found', { _tags: 'core' })} />}
			onEndReached={onEndReached}
			loading={loading}
		/>
	);
};

export default CustomersTable;
