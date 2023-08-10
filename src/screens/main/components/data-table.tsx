import * as React from 'react';

import get from 'lodash/get';
import { useObservableState, useObservableSuspense } from 'observable-hooks';
import { useTheme } from 'styled-components/native';

import Box from '@wcpos/components/src/box';
import ErrorBoundary from '@wcpos/components/src/error-boundary';
import Suspense from '@wcpos/components/src/suspense';
import Table, { TableContextProps, CellRenderer } from '@wcpos/components/src/table';
import Text from '@wcpos/components/src/text';

import EmptyTableRow from './empty-table-row';
import SyncButton from './sync-button';
import TextCell from './text-cell';
import { t } from '../../../lib/translations';
import useTotalCount from '../hooks/use-total-count';

import type { Query } from '../../../contexts/store-state-manager';

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
	const { sync, clear, replicationState } = query;
	const loading = useObservableState(replicationState.active$, false);
	const count = useObservableState(query.count$, 0);
	const total = useTotalCount(replicationState);

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
	const { sortBy, sortDirection } = useObservableState(query.state$, query.currentState);

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
			onEndReachedThreshold={0.5}
			footer={<DataTableFooter query={query} children={footer} />}
		/>
	);
};

export default DataTable;
