import * as React from 'react';

import get from 'lodash/get';
import { useObservableState, useObservableSuspense } from 'observable-hooks';
import { map, tap } from 'rxjs/operators';

import ErrorBoundary from '@wcpos/components/src/error-boundary';
import Suspense from '@wcpos/components/src/suspense';
import Table, { TableContextProps, CellRenderer } from '@wcpos/components/src/table';

import cells from './cells';
import Footer from './footer';
import { t } from '../../../lib/translations';
import EmptyTableRow from '../components/empty-table-row';
import TextCell from '../components/text-cell';
import { useCustomers } from '../contexts/customers';
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
	const { query, paginatedResource, replicationState, loadNextPage } = useCustomers();
	const { data, count, hasMore } = useObservableSuspense(paginatedResource);
	const loading = useObservableState(replicationState.active$, false);
	const total = useTotalCount('customers', replicationState);
	const columns = useObservableState(
		uiSettings.get$('columns'),
		uiSettings.get('columns')
	) as UISettingsColumn[];
	const { sortBy, sortDirection } = useObservableState(query.state$, query.currentState);

	/**
	 *
	 */
	const cellRenderer = React.useCallback<CellRenderer<CustomerDocument>>(
		({ item, column, index, cellWidth }) => {
			const Cell = get(cells, [column.key]);

			if (Cell) {
				return (
					<ErrorBoundary>
						<Suspense>
							<Cell item={item} column={column} index={index} cellWidth={cellWidth} />
						</Suspense>
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
	const context = React.useMemo<TableContextProps<CustomerDocument>>(() => {
		return {
			columns: columns.filter((column) => column.show),
			sort: ({ sortBy, sortDirection }) => query.sort(sortBy, sortDirection),
			sortBy,
			sortDirection,
			cellRenderer,
			headerLabel: ({ column }) => uiSettings.getLabel(column.key),
		};
	}, [columns, sortBy, sortDirection, cellRenderer, query, uiSettings]);

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
			context={context}
			ListEmptyComponent={<EmptyTableRow message={t('No customers found', { _tags: 'core' })} />}
			onEndReached={onEndReached}
			loading={loading}
		/>
	);
};

export default CustomersTable;
