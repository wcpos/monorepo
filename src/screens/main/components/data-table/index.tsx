import * as React from 'react';

import { Column, ColumnDef } from '@tanstack/react-table';
import find from 'lodash/find';
import get from 'lodash/get';
import { useObservableEagerState } from 'observable-hooks';

import type {
	ProductDocument,
	OrderDocument,
	CustomerDocument,
	TaxRateDocument,
} from '@wcpos/database';
import { useInfiniteScroll, Query } from '@wcpos/query';
import { DataTable as Table, DataTableProps } from '@wcpos/tailwind/src/data-table';
import { ErrorBoundary } from '@wcpos/tailwind/src/error-boundary';
import { Suspense } from '@wcpos/tailwind/src/suspense';

import { ListEmptyComponent } from './empty';
import { DataTableFooter } from './footer';
import { DataTableHeader } from './header';
import { useUISettings, UISettingID } from '../../contexts/ui-settings';
import { TextCell } from '../text-cell';

type DocumentType = ProductDocument | OrderDocument | CustomerDocument | TaxRateDocument;
type CollectionFromDocument<T> = T extends { collection: infer C } ? C : never;

interface Props<TDocument> extends DataTableProps<TDocument, any> {
	id: UISettingID;
	query: Query<CollectionFromDocument<TDocument>>;
	cells: Record<string, React.ComponentType<any>>;
	noDataMessage?: string;
}

/**
 * Tables are expensive to render, so memoize all props.
 */
const DataTable = <TDocument extends DocumentType>({
	id,
	query,
	cells,
	renderItem,
	noDataMessage,
	TableFooterComponent = DataTableFooter,
	extraContext,
	...props
}: Props<TDocument>) => {
	const { uiSettings, getUILabel } = useUISettings(id);
	const uiColumns = useObservableEagerState(uiSettings.columns$);
	const result = useInfiniteScroll(query);

	/**
	 *
	 */

	/**
	 *
	 */
	const columns: ColumnDef<TDocument>[] = React.useMemo(() => {
		return uiColumns
			.filter((column) => column.show)
			.map((col) => {
				const title = getUILabel(col.key);
				const Cell = get(cells, [col.key]);

				return {
					accessorKey: col.key,
					header: ({ column }) => <DataTableHeader title={title} column={column} />,
					// size: column.size,
					cell: (props) => {
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
	}, [cells, uiColumns, getUILabel]);

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
	 *
	 */
	return (
		<>
			<Table
				// isRefreshing={isRefreshing}
				// onRefresh={onRefresh}
				data={result.hits.map(({ document }) => document)}
				columns={columns}
				onEndReached={result.nextPage}
				onEndReachedThreshold={0.5}
				ListEmptyComponent={<ListEmptyComponent message={noDataMessage} />}
				TableFooterComponent={TableFooterComponent}
				renderItem={renderItem ? (props) => renderItem(props) : undefined}
				extraContext={context}
				{...props}
			/>
		</>
	);
};

export { DataTable, DataTableFooter, DataTableHeader };
