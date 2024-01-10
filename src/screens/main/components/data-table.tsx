import * as React from 'react';

import get from 'lodash/get';
import { useObservableState, useSubscription } from 'observable-hooks';
import { useTheme } from 'styled-components/native';

import Box from '@wcpos/components/src/box';
import ErrorBoundary from '@wcpos/components/src/error-boundary';
import Loader from '@wcpos/components/src/loader';
import Suspense from '@wcpos/components/src/suspense';
import Table, { TableContextProps, CellRenderer } from '@wcpos/components/src/table';
import Text from '@wcpos/components/src/text';
import { useReplicationState, Query, useInfiniteScroll } from '@wcpos/query';
import logger from '@wcpos/utils/src/logger';

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
const DataTableFooter = ({ query, children, count }) => {
	const theme = useTheme();
	const { sync, active$, total$ } = useReplicationState(query);
	const { clear } = useCollectionReset(query.collection.name);
	const loading = useObservableState(active$, false);
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
	const { active$ } = useReplicationState(query);
	const loading = useObservableState(active$, false);

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
	const result = useInfiniteScroll(query);
	const columns = useObservableState(
		uiSettings.get$('columns'),
		uiSettings.get('columns')
	) as UISettingsColumn[];
	const { sortBy, sortDirection } = useObservableState(query.params$, query.getParams());
	const listRef = React.useRef();

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
							<Cell item={item.document} column={column} index={index} />
						</Suspense>
					</ErrorBoundary>
				);
			}

			return <TextCell item={item.document} column={column} />;
		},
		[cells]
	);

	/**
	 *
	 */
	const context = React.useMemo<TableContextProps<DocumentType>>(() => {
		return {
			columns: columns.filter((column) => column.show),
			sort: result.searchActive
				? null
				: ({ sortBy, sortDirection }) => query.sort(sortBy, sortDirection),
			sortBy,
			sortDirection,
			cellRenderer,
			headerLabel: ({ column }) => uiSettings.getLabel(column.key),
			query,
			...extraContext,
		};
	}, [
		columns,
		result.searchActive,
		sortBy,
		sortDirection,
		cellRenderer,
		query,
		extraContext,
		uiSettings,
	]);

	/**
	 * If the query params change, we should scroll to top
	 */
	useSubscription(query.params$, () => {
		if (listRef?.current) {
			listRef.current?.scrollToOffset({ offset: 0 });
		}
	});

	/**
	 *
	 */
	return (
		<Table<DocumentType>
			ref={listRef}
			data={result.hits}
			renderItem={renderItem}
			estimatedItemSize={estimatedItemSize}
			context={context}
			ListEmptyComponent={<EmptyTableRow message={noDataMessage} />}
			onEndReached={() => result.nextPage()}
			onEndReachedThreshold={0.5}
			footer={<DataTableFooter query={query} children={footer} count={result.count} />}
			ListFooterComponent={<LoadingRow query={query} />}
		/>
	);
};

export default DataTable;
