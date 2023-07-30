import * as React from 'react';

import get from 'lodash/get';
import { useObservableState, useObservableSuspense } from 'observable-hooks';

import ErrorBoundary from '@wcpos/components/src/error-boundary';
import Suspense from '@wcpos/components/src/suspense';
import Table, { TableContextProps, CellRenderer } from '@wcpos/components/src/table';

import EmptyTableRow from './empty-table-row';
import TextCell from './text-cell';

import type { Query } from '../../../contexts/store-state-manager';

type UISettingsColumn = import('../contexts/ui-settings').UISettingsColumn; // Change to your own type

interface CommonTableProps<DocumentType> {
	query: Query<DocumentType>;
	uiSettings: import('../contexts/ui-settings').UISettingsDocument; // Change to your own type
	cells: Record<string, React.FC<any>>;
	renderItem?: (props: any) => JSX.Element;
	noDataMessage: string;
	estimatedItemSize: number;
}

const DataTable = <DocumentType,>({
	query,
	uiSettings,
	cells,
	renderItem,
	noDataMessage = 'No record found',
	estimatedItemSize,
}: CommonTableProps<DocumentType>) => {
	const data = useObservableSuspense(query.resource);
	const columns = useObservableState(
		uiSettings.get$('columns'),
		uiSettings.get('columns')
	) as UISettingsColumn[];
	const { sortBy, sortDirection } = useObservableState(query.state$, query.currentState);

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

	const context = React.useMemo<TableContextProps<DocumentType>>(() => {
		return {
			columns: columns.filter((column) => column.show),
			sort: ({ sortBy, sortDirection }) => query.sort(sortBy, sortDirection),
			sortBy,
			sortDirection,
			cellRenderer,
			headerLabel: ({ column }) => uiSettings.getLabel(column.key),
		};
	}, [columns, sortBy, sortDirection, cellRenderer, query, uiSettings]);

	return (
		<Table<DocumentType>
			data={data}
			renderItem={renderItem}
			estimatedItemSize={estimatedItemSize}
			context={context}
			ListEmptyComponent={<EmptyTableRow message={noDataMessage} />}
		/>
	);
};

export default DataTable;
