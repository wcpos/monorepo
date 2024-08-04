import * as React from 'react';

import { Column, ColumnDef } from '@tanstack/react-table';
import get from 'lodash/get';
import { useObservableEagerState } from 'observable-hooks';

import type {
	ProductDocument,
	OrderDocument,
	CustomerDocument,
	TaxRateDocument,
} from '@wcpos/database';
import { useInfiniteScroll, Query } from '@wcpos/query';
import { DataTable as FlashList, DataTableProps } from '@wcpos/tailwind/src/data-table';
import { ErrorBoundary } from '@wcpos/tailwind/src/error-boundary';
import { Suspense } from '@wcpos/tailwind/src/suspense';
import { TableRow } from '@wcpos/tailwind/src/table2';
import { Text } from '@wcpos/tailwind/src/text';

import { Footer } from './footer';
import { Header } from './header';
import { useUISettings, UISettingID } from '../../contexts/ui-settings';
import { TextCell } from '../text-cell';

type DocumentType = ProductDocument | OrderDocument | CustomerDocument | TaxRateDocument;

interface Props extends DataTableProps<any, any> {
	id: UISettingID;
	query: Query<any>;
	cells: Record<string, any>;
	renderItem?: (props: any) => React.ReactNode;
}

/**
 *
 */
export const DataTable = <T extends DocumentType>({
	id,
	query,
	cells,
	renderItem,
	...props
}: Props) => {
	const { uiSettings, getUILabel } = useUISettings(id);
	const uiColumns = useObservableEagerState(uiSettings.columns$);
	const result = useInfiniteScroll(query);

	/**
	 *
	 */

	/**
	 *
	 */
	const columns: ColumnDef<T>[] = React.useMemo(() => {
		return uiColumns
			.filter((column) => column.show)
			.map((col) => {
				const title = getUILabel(col.key);
				const Cell = get(cells, [col.key]);

				return {
					accessorKey: col.key,
					header: ({ column }) => <Header title={title} column={column} />,
					// size: column.size,
					cell: ({ row }) => {
						if (Cell) {
							return (
								<ErrorBoundary>
									<Suspense>
										<Cell item={row.original.document} column={col} />
									</Suspense>
								</ErrorBoundary>
							);
						}

						return <TextCell item={row.original.document} column={col} />;
					},
				};
			});
	}, [cells, uiColumns, getUILabel]);

	/**
	 *
	 */
	return (
		<>
			<FlashList
				// isRefreshing={isRefreshing}
				// onRefresh={onRefresh}
				data={result.hits}
				columns={columns}
				onEndReached={result.nextPage}
				onEndReachedThreshold={0.5}
				ListEmptyComponent={() => {
					return (
						<TableRow className="border-b-0 dark:opacity-50">
							<Text>empty</Text>
						</TableRow>
					);
				}}
				renderItem={renderItem ? (props) => renderItem({ ...props, columns }) : undefined}
				{...props}
			/>
			<Footer query={query} count={result.hits.length} />
		</>
	);
};
