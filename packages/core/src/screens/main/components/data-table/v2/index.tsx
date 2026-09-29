import * as React from 'react';
import { View } from 'react-native';

import {
	columnVisibilityFeature,
	createExpandedRowModel,
	flexRender,
	rowExpandingFeature,
	rowSelectionFeature,
	rowSortingFeature,
	tableFeatures,
	useTable,
} from '@tanstack/react-table';
import { useObservableSuspense } from 'observable-hooks';
import { find } from 'lodash';

import { usePointer } from '@wcpos/components/lib/device';
import { Table, TableBody, TableFooter, TableHeader, TableRow } from '@wcpos/components/table';
import { Text } from '@wcpos/components/text';
import * as VirtualizedList from '@wcpos/components/virtualized-list';
import type { QueryResult } from '@wcpos/query';
import { useDocField } from '@wcpos/query';

import { useGuardedExtendLimit } from '../../../../../query';
import { UISettingID, useUISettings } from '../../../contexts/ui-settings';
import { RecordTextCell } from '../../record-text-cell';
import { useT } from '../../../../../contexts/translations';
import { DataTableHeader } from '../header';
import { DataTableFooter } from '../footer';
import { ListFooterComponent as DefaultListFooterComponent } from '../list-footer';
import { getRowTestID, DataTableRow as RowView } from './rows';
import { ResizeHead } from './resize';
import { getColumnStyle } from '../index';

import type { SortingChange } from '../sort-field';
import type { CollectionKey as QueryCollectionKey } from '../../../../../query';
import type { RowData, TableOptions } from '@tanstack/react-table';
import type { ColumnDef, Header, Row, Table as TanStackTable } from '../../../../../table-types';

const dataTableFeatures = tableFeatures({
	columnVisibilityFeature,
	rowSortingFeature,
	rowExpandingFeature,
	expandedRowModel: createExpandedRowModel(),
	rowSelectionFeature,
});

type DataTableFeatures = typeof dataTableFeatures;
type DataTableRow = QueryResult<import('rxdb').RxCollection>['hits'][number];
type CellComponent = React.ElementType;
type CellMap = Record<string, CellComponent>;
type DataTableConfig<TData extends RowData> = Omit<
	Partial<TableOptions<DataTableFeatures, TData>>,
	'meta'
> & {
	meta?: Record<string, unknown>;
	extraData?: unknown;
};

type DataTableCollectionKey = Exclude<QueryCollectionKey, 'tax-rates'>;

interface RenderHeaderProps {
	header: Header<DataTableRow, unknown, DataTableFeatures>;
	table: TanStackTable<DataTableRow, DataTableFeatures>;
	collectionName?: DataTableCollectionKey;
	sortBy: string;
	sortDirection: 'asc' | 'desc';
	onSortingChange: (sort: SortingChange) => void;
}

type BindingDataTableFooterProps = React.ComponentProps<typeof DataTableFooter>;

interface BindingActions<TSortField extends string> {
	setSort(field: TSortField, direction: 'asc' | 'desc'): void;
	extendLimit(): void;
	setFilter: (...args: never[]) => void;
}

interface CommonProps<TData extends RowData> {
	id: UISettingID;
	noDataMessage?: string | React.ReactElement;
	estimatedItemSize?: number;
	showFooter?: boolean;
	renderItem?: (params: {
		item: any;
		index: number;
		table: any;
	}) => React.ReactElement<React.ComponentProps<typeof VirtualizedList.Item>>;
	cells?: CellMap;
	cellsForRow?: (row: Row<TData, DataTableFeatures>) => CellMap;
	renderHeader?: (props: RenderHeaderProps) => React.ReactNode;
	tableConfig?: DataTableConfig<TData>;
	getItemType?: (row: any) => string;
	ListFooterComponent?: React.ComponentType<any>;
}

type BindingProps<TSortField extends string> = {
	collectionName: DataTableCollectionKey;
	binding?: Pick<import('../../../../../query').QueryBinding, 'pending$' | 'exhausted$'>;
	resource: import('observable-hooks').ObservableResource<QueryResult<import('rxdb').RxCollection>>;
	sort: { field: TSortField; direction: 'asc' | 'desc' };
	actions: BindingActions<TSortField>;
	TableFooterComponent?: React.ComponentType<BindingDataTableFooterProps>;
	active$: import('rxjs').Observable<boolean>;
	total$: import('rxjs').Observable<number | null>;
	sync: () => Promise<void>;
};

type Props<TData extends RowData, TSortField extends string> = CommonProps<TData> &
	BindingProps<TSortField>;

function DataTable<TData extends RowData, TSortField extends string = string>(
	props: Props<TData, TSortField>
) {
	/*
	 * NOTE (react-table v9): this component is now compiled by the React
	 * Compiler, and that is a real change. Under v8 the compiler skipped it on
	 * its own ("Compilation Skipped: Use of incompatible library" — it
	 * recognised `useReactTable`), and a `useReactTableWrapper` hook returned
	 * `{ ...useReactTable(...) }` so the table's identity changed every render
	 * (facebook/react#33057). v9 removes both halves of that: it is
	 * compiler-compatible, and spreading is illegal because row/cell/column
	 * methods live on prototypes. A `'use no memo'` bail-out is not an option
	 * either — react-compiler now reports it as an unused directive.
	 *
	 * What holds this together is v9's store subscription, and the guard for it
	 * is `index.test.tsx`'s "re-renders header cells when the visible column set
	 * changes", which runs against this file compiled exactly as the app
	 * compiles it (see the transform routing in jest.config.js). If a stale memo
	 * ever creeps back, that test fails instead of a cashier's column toggle
	 * quietly doing nothing.
	 */
	const {
		id,
		noDataMessage,
		estimatedItemSize,
		showFooter = true,
		renderItem,
		cells,
		cellsForRow,
		renderHeader,
		tableConfig,
		getItemType,
		ListFooterComponent,
	} = props;
	const pointer = usePointer();
	const resource = props.resource;
	const { uiSettings, getUILabel, patchUI } = useUISettings(id);
	const settingsColumns = useDocField(uiSettings, (value) => value.columns);
	const [widths, setWidths] = React.useState(() => new Map<string, number>());
	const uiColumns = React.useMemo(
		() =>
			settingsColumns.map((column) =>
				widths.has(column.key)
					? { ...column, width: widths.get(column.key), flex: undefined }
					: column
			),
		[settingsColumns, widths]
	);
	const t = useT();
	const result = useObservableSuspense(resource);
	const deferredResult = React.useDeferredValue(result);

	const columns = React.useMemo(
		() => buildColumns(uiColumns, getUILabel, cells, cellsForRow),
		[uiColumns, getUILabel, cells, cellsForRow]
	);

	const columnVisibility = React.useMemo(
		() => Object.fromEntries(uiColumns.map((c) => [c.key, c.show])),
		[uiColumns]
	);

	const sortBy = props.sort.field;
	const sortDirection = props.sort.direction;

	const handleSortingChange = React.useCallback(
		({ sortBy, sortDirection }: SortingChange) => {
			void patchUI({ sortBy, sortDirection });
			props.actions.setSort(sortBy as TSortField, sortDirection);
		},
		[patchUI, props.actions]
	);

	// Guarded (#1221): pending blocks; full local reads extend regardless of exhaustion.
	// Short local reads stop unless the engine says more may exist.
	const handleEndReached = useGuardedExtendLimit(
		props.actions.extendLimit,
		deferredResult.hits.length,
		props.binding
	);

	const table = useTable<DataTableFeatures, DataTableRow>({
		features: dataTableFeatures,
		columns,
		data: deferredResult.hits,
		getRowId: (row) => row.id,
		...(tableConfig as unknown as Partial<TableOptions<DataTableFeatures, DataTableRow>>),
		state: { columnVisibility, ...tableConfig?.state },
		meta: {
			...tableConfig?.meta,
			actions: { setFilter: props.actions.setFilter },
		} as unknown as TableOptions<DataTableFeatures, DataTableRow>['meta'],
	});

	/**
	 * Extra data is needed to force a re-render of FlashList on certain state changes
	 */
	const extraData = React.useMemo(() => {
		return {
			columnVisibility,
			widths,
			tableConfig: tableConfig?.extraData,
		};
	}, [columnVisibility, widths, tableConfig?.extraData]);

	return (
		<Table className="flex h-full flex-col">
			{pointer === 'fine' && (
				<TableHeader>
					{table.getHeaderGroups().map((headerGroup) => (
						<TableRow key={headerGroup.id} className="min-h-row border-border border-b">
							{headerGroup.headers.map((header, index) => (
								<ResizeHead
									key={header.id}
									columnId={header.column.id}
									meta={header.column.columnDef.meta}
									last={index === headerGroup.headers.length - 1}
									onResize={(width) =>
										setWidths((previous) => new Map(previous).set(header.column.id, width))
									}
								>
									{renderHeader ? (
										renderHeader({
											header,
											table,
											collectionName: props.collectionName,
											sortBy,
											sortDirection,
											onSortingChange: handleSortingChange,
										})
									) : (
										<DataTableHeader
											collectionName={props.collectionName}
											columnId={header.column.id}
											header={
												<Text className="text-muted-foreground text-xs tracking-wide uppercase">
													{flexRender(header.column.columnDef.header, header.getContext())}
												</Text>
											}
											disableSort={!header.column.getCanSort()}
											sortBy={sortBy}
											sortDirection={sortDirection}
											onSortingChange={handleSortingChange}
											align={header.column.columnDef.meta?.align}
										/>
									)}
								</ResizeHead>
							))}
						</TableRow>
					))}
				</TableHeader>
			)}
			<VirtualizedList.Root
				testID={`data-table-scroller-${props.collectionName}`}
				style={{ flex: 1 }}
			>
				<VirtualizedList.List
					data={table.getRowModel().rows}
					keyExtractor={(item) => item.id}
					renderItem={({ item, index }) =>
						renderItem
							? renderItem({ item, index, table })
							: defaultRenderItem({ item, index, table })
					}
					estimatedItemSize={estimatedItemSize ?? 50}
					parentComponent={TableBody as unknown as typeof import('react-native').View}
					getItemType={getItemType}
					onEndReachedThreshold={0.1}
					onEndReached={handleEndReached}
					ListEmptyComponent={() => (
						<View className="justify-center p-6">
							{/* "No results" may only ever mean the search ANSWERED with nothing.
							    A pending search (index building, engine database not bound yet)
							    says so instead — rendering the ordinary empty state there reads
							    as "this record does not exist" (#1733). */}
							{deferredResult.searchActive && deferredResult.searchState === 'pending' ? (
								<Text testID="search-pending-message">{t('common.searching')}</Text>
							) : React.isValidElement(noDataMessage) ? (
								noDataMessage
							) : (
								<Text testID="no-data-message">
									{noDataMessage ? noDataMessage : t('common.no_results_found')}
								</Text>
							)}
						</View>
					)}
					ListFooterComponent={() =>
						ListFooterComponent ? (
							<ListFooterComponent active$={props.active$} />
						) : (
							<DefaultListFooterComponent active$={props.active$} />
						)
					}
					extraData={extraData}
				/>
			</VirtualizedList.Root>
			{showFooter && (
				<TableFooter>
					{props.TableFooterComponent ? (
						<props.TableFooterComponent
							collectionName={props.collectionName}
							active$={props.active$}
							total$={props.total$}
							sync={props.sync}
							count={result.hits.length}
						/>
					) : (
						<DataTableFooter
							collectionName={props.collectionName}
							active$={props.active$}
							total$={props.total$}
							sync={props.sync}
							count={result.hits.length}
						/>
					)}
				</TableFooter>
			)}
		</Table>
	);
}

function defaultRenderItem({
	item,
}: {
	item: Row<DataTableRow, DataTableFeatures>;
	index: number;
	table: TanStackTable<DataTableRow, DataTableFeatures>;
}) {
	return (
		<VirtualizedList.Item>
			<RowView item={item} />
		</VirtualizedList.Item>
	);
}

function buildColumns<TData extends RowData>(
	columns: any,
	getUILabel: (key: string) => string,
	cells?: CellMap,
	cellsForRow?: (row: Row<TData, DataTableFeatures>) => CellMap
): ColumnDef<DataTableRow, unknown, DataTableFeatures>[] {
	return columns.map((c: any) => {
		return {
			accessorKey: c.key,
			enableSorting: !c.disableSort,
			meta: {
				flex: c.flex,
				align: c.align,
				width: c.width,
				show: (key: string) => {
					const d = find(c.display, { key });
					return !!(d && d.show);
				},
			},
			cell: (info: any) => {
				const rowCells = cellsForRow ? cellsForRow(info.row) : cells;
				const Cell = rowCells?.[c.key] ?? RecordTextCell;
				return <Cell {...info} />;
			},
			header: c.hideLabel ? '' : getUILabel(c.key),
		};
	});
}

export {
	DataTable,
	DataTableHeader,
	DataTableFooter,
	defaultRenderItem,
	getColumnStyle,
	getRowTestID,
};
export type { RenderHeaderProps, SortingChange };
export type { BindingDataTableFooterProps };
export type { CellComponent, DataTableFeatures };
