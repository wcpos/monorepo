import * as React from 'react';

import find from 'lodash/find';
import { useObservableState } from 'observable-hooks';
import { skip } from 'rxjs/operators';

import { DataTable as Table, DataTableProps } from '@wcpos/components/src/data-table';
import { ErrorBoundary } from '@wcpos/components/src/error-boundary';
import { Suspense } from '@wcpos/components/src/suspense';
import type {
	ProductDocument,
	OrderDocument,
	CustomerDocument,
	TaxRateDocument,
	LogDocument,
} from '@wcpos/database';
import { useInfiniteScroll, Query } from '@wcpos/query';

import { ListEmptyComponent } from './empty';
import { DataTableFooter } from './footer';
import { DataTableHeader } from './header';
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
	/**
	 * FIXME: A bug started happening where useObservableEagerState(uiSettings.columns$)
	 * causes an infinite loop. This hack fixes it for now, but I would love to know why
	 * this just started happening.
	 */
	const uiColumns = useObservableState(uiSettings.columns$.pipe(skip(1)), uiSettings.columns);
	const result = useInfiniteScroll(query);
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
									<Suspense>
										<Header {...props} />
									</Suspense>
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
									<Suspense>
										<Cell {...props} />
									</Suspense>
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
			query.sort(sortBy, sortDirection);
		},
		[query]
	);

	/**
	 *
	 */
	return (
		<Table
			data={result.hits.map(({ document }) => document)}
			columns={columns}
			onEndReached={result.nextPage}
			onEndReachedThreshold={0.5}
			ListEmptyComponent={<ListEmptyComponent message={noDataMessage} />}
			TableFooterComponent={TableFooterComponent}
			renderItem={renderItem ? (props) => renderItem(props) : undefined}
			extraContext={context}
			onSortingChange={handleSortingChange}
			tableState={{ sorting }}
			{...props}
		/>
	);
};

export { DataTable, DataTableFooter, DataTableHeader };
