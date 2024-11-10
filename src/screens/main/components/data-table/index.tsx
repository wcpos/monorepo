import * as React from 'react';

import find from 'lodash/find';
import {
	useObservableEagerState,
	useObservableSuspense,
	useObservableState,
} from 'observable-hooks';

import { DataTable as Table, DataTableProps } from '@wcpos/components/src/data-table';
import { ErrorBoundary } from '@wcpos/components/src/error-boundary';
import type {
	ProductDocument,
	OrderDocument,
	CustomerDocument,
	TaxRateDocument,
	LogDocument,
} from '@wcpos/database';
import { Query } from '@wcpos/query';

import { ListEmptyComponent } from './empty';
import { DataTableFooter } from './footer';
import { DataTableHeader } from './header';
import { ListFooterComponent } from './list-footer';
import { useUISettings, UISettingID } from '../../contexts/ui-settings';
import { TextCell } from '../text-cell';

import type { CellContext, ColumnDef, HeaderContext } from '@tanstack/react-table';

type DocumentType =
	| ProductDocument
	| OrderDocument
	| CustomerDocument
	| TaxRateDocument
	| LogDocument;
type CollectionFromDocument<T> = T extends { collection: infer C } ? C : never;

interface Props<TDocument> extends DataTableProps<TDocument, any> {
	id: UISettingID;
	query: Query<CollectionFromDocument<TDocument>>;
	renderCell: (props: CellContext<TDocument, unknown>) => React.ComponentType<any>;
	renderHeader: (props: HeaderContext<TDocument, unknown>) => React.ComponentType<any>;
	noDataMessage?: string;
}

/**
 * Tables are expensive to render, so memoize all props.
 */
const DataTable = <TDocument extends DocumentType>({
	id,
	query,
	renderHeader,
	renderCell,
	renderItem,
	noDataMessage,
	TableFooterComponent = DataTableFooter,
	extraContext,
	...props
}: Props<TDocument>) => {
	const { uiSettings, getUILabel } = useUISettings(id);
	const uiColumns = useObservableEagerState(uiSettings.columns$);
	const result = useObservableSuspense(query.resource);
	const sorting = React.useRef({
		sortBy: uiSettings.sortBy,
		sortDirection: uiSettings.sortDirection,
	});

	/**
	 *
	 */
	const columns: ColumnDef<TDocument>[] = React.useMemo(() => {
		return uiColumns
			.filter((column) => column.show)
			.map((col) => {
				return {
					accessorKey: col.key,
					header: (props) => {
						const Header = renderHeader && renderHeader(props);

						if (Header) {
							return (
								<ErrorBoundary>
									<Header {...props} />
								</ErrorBoundary>
							);
						}

						return <DataTableHeader title={getUILabel(props.column.id)} {...props} />;
					},
					// size: column.size,
					cell: (props) => {
						const Cell = renderCell && renderCell(props);

						if (Cell) {
							return (
								<ErrorBoundary>
									<Cell {...props} />
								</ErrorBoundary>
							);
						}

						return <TextCell {...props} />;
					},
					meta: {
						...col,
						show: (key: string) => {
							const d = find(col.display, { key });
							return !!(d && d.show);
						},
					},
				};
			});
	}, [uiColumns, renderHeader, getUILabel, renderCell]);

	/**
	 * Pass down
	 * - query instance
	 * - total count of results for the Table Footer
	 * - and any other extraContext
	 */
	const context = React.useMemo(
		() => ({ query, count: result.hits.length, ...extraContext }),
		[extraContext, query, result.hits.length]
	);

	/**
	 * Sorting
	 */
	const handleSortingChange = React.useCallback(
		({ sortBy, sortDirection }) => {
			sorting.current = { sortBy, sortDirection };
			query.sort([{ [sortBy]: sortDirection }]).exec();
		},
		[query]
	);

	/**
	 *
	 */
	return (
		<Table
			// data={result.hits.map(({ document }) => document)}
			data={result.hits}
			columns={columns}
			onEndReached={() => {
				if (query.infiniteScroll) {
					query.loadMore();
				}
			}}
			onEndReachedThreshold={0.1}
			ListEmptyComponent={<ListEmptyComponent message={noDataMessage} />}
			ListFooterComponent={ListFooterComponent}
			TableFooterComponent={TableFooterComponent}
			renderItem={renderItem ? (props) => renderItem(props) : undefined}
			extraContext={context}
			onSortingChange={handleSortingChange}
			tableState={{ sorting }}
			debug={true}
			{...props}
		/>
	);
};

export { DataTable, DataTableFooter, DataTableHeader };
