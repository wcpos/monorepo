import * as React from 'react';

import get from 'lodash/get';
import { useObservableState, useObservableSuspense } from 'observable-hooks';
import { useTheme } from 'styled-components/native';

import Box from '@wcpos/components/src/box';
import ErrorBoundary from '@wcpos/components/src/error-boundary';
import Loader from '@wcpos/components/src/loader';
import Suspense from '@wcpos/components/src/suspense';
import Table, { TableContextProps, CellRenderer } from '@wcpos/components/src/table';
import Text from '@wcpos/components/src/text';
import { useReplicationState, Query } from '@wcpos/query';

import EmptyTableRow from './empty-table-row';
import SyncButton from './sync-button';
import TextCell from './text-cell';
import { useT } from '../../../contexts/translations';
import { useCollectionReset } from '../hooks/use-collection-reset';

type UISettingsColumn = import('../contexts/ui-settings').UISettingsColumn;

interface CommonTableProps<DocumentType> {
	query: Query<DocumentType>;
	uiSettings: import('../contexts/ui-settings').UISettingsDocument;
	cells: Record<string, React.FC<any>>;
	renderItem?: (props: any) => JSX.Element;
	noDataMessage: string;
	estimatedItemSize: number;
	extraContext?: Partial<TableContextProps<DocumentType>>;
	footer?: React.ReactNode;
}

/**
 *
 */
const DataTableFooter = ({ query, children }) => {
	const theme = useTheme();
	const { sync, active$, total$ } = useReplicationState(query);
	const { clear } = useCollectionReset(query.collection.name);
	const loading = useObservableState(active$, false);
	const count = useObservableState(query.count$, 0); // count is the query count, not pagination count
	const total = useObservableState(total$, 0);
	const t = useT();

	return (
		<Box
			horizontal
			style={{
				width: '100%',
				backgroundColor: theme.colors.lightGrey,
				borderBottomLeftRadius: theme.rounding.medium,
				borderBottomRightRadius: theme.rounding.medium,
				borderTopWidth: 1,
				borderTopColor: theme.colors.grey,
			}}
		>
			{children}
			<Box fill horizontal padding="small" space="xSmall" align="center" distribution="end">
				<Text size="small">{t('Showing {count} of {total}', { count, total, _tags: 'core' })}</Text>
				<SyncButton sync={sync} clear={clear} active={loading} />
			</Box>
		</Box>
	);
};

/**
 * Loading row should be separate from the table component to check loading state from the DataTable
 */
const LoadingRow = ({ query }) => {
	// const loading = useObservableState(query.replicationState.active$, false);
	const loading = false;

	return <Table.LoadingRow loading={loading} />;
};

/**
 *
 */
const DataTable = <DocumentType,>({
	query,
	uiSettings,
	cells,
	renderItem,
	noDataMessage = 'No record found',
	estimatedItemSize,
	extraContext,
	footer,
}: CommonTableProps<DocumentType>) => {
	const data = useObservableSuspense(query.paginatedResource);
	const columns = useObservableState(
		uiSettings.get$('columns'),
		uiSettings.get('columns')
	) as UISettingsColumn[];
	const { sortBy, sortDirection } = useObservableState(query.params$, query.getParams());

	/**
	 *
	 */
	const cellRenderer = React.useCallback<CellRenderer<DocumentType>>(
		({ item, column, index }) => {
			const Cell = get(cells, [column.key]);

			if (Cell) {
				return (
					<ErrorBoundary>
						<Suspense>
							<Cell item={item} column={column} index={index} />
						</Suspense>
					</ErrorBoundary>
				);
			}

			return <TextCell item={item} column={column} />;
		},
		[cells]
	);

	/**
	 *
	 */
	const context = React.useMemo<TableContextProps<DocumentType>>(() => {
		return {
			columns: columns.filter((column) => column.show),
			sort: ({ sortBy, sortDirection }) => query.sort(sortBy, sortDirection),
			sortBy,
			sortDirection,
			cellRenderer,
			headerLabel: ({ column }) => uiSettings.getLabel(column.key),
			query,
			...extraContext,
		};
	}, [columns, sortBy, sortDirection, cellRenderer, extraContext, query, uiSettings]);

	/**
	 *
	 */
	return (
		<Table<DocumentType>
			data={data}
			renderItem={renderItem}
			estimatedItemSize={estimatedItemSize}
			context={context}
			ListEmptyComponent={<EmptyTableRow message={noDataMessage} />}
			onEndReached={() => query.nextPage()}
			onEndReachedThreshold={1}
			footer={<DataTableFooter query={query} children={footer} />}
			ListFooterComponent={<LoadingRow query={query} />}
		/>
	);
};

export default DataTable;
