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
import { useObservableState, useObservableSuspense } from 'observable-hooks';
import { find } from 'lodash';
import { of } from 'rxjs';

import { usePointer } from '@wcpos/components/lib/device';
import { Table, TableBody, TableFooter, TableHeader, TableRow } from '@wcpos/components/table';
import { Text } from '@wcpos/components/text';
import * as VirtualizedList from '@wcpos/components/virtualized-list';
import type { QueryHandle, QueryResult } from '@wcpos/query';
import { useDocField } from '@wcpos/query';

import {
	bindingObservablesFor,
	useGuardedExtendLimitFor,
	useQueryHandleFields,
	useQuerySnapshot,
} from '../../../../../query';
import { DataTableFooterFor } from '../footer';
import { UISettingID, useUISettings } from '../../../contexts/ui-settings';
import { RecordTextCell } from '../../record-text-cell';
import { useT } from '../../../../../contexts/translations';
import { DataTableHeader } from '../header';
import { DataTableFooter } from './footer';
import { ListFooterComponent as DefaultListFooterComponent } from '../list-footer';
import { getRowTestID, DataTableRow as RowView } from './rows';
import { ResizeHead } from './resize';
import { DataTableSkeletonRows } from './skeleton';
import { getColumnStyle } from '../index';
import { TableSurface } from '../surface';

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
	listRef?: React.Ref<import('@wcpos/components/virtualized-list/types').VirtualizedListHandle>;
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
	/** Off for a table that borrows another's settings id (the variations pane): a header sort must not rewrite the products sort. */
	persistSort?: boolean;
	tableConfig?: DataTableConfig<TData>;
	getItemType?: (row: any) => string;
	ListFooterComponent?: React.ComponentType<any>;
	/**
	 * Replaces the table's own end-reached (`actions.extendLimit` behind its guard) for a caller
	 * that guards and arms its paging itself (a browse level, which pages on its own rows and
	 * re-fires an end-reached the guard ignored while pending).
	 */
	onEndReached?: () => void;
}

type TableProps<TSortField extends string> = {
	collectionName: DataTableCollectionKey;
	sort: { field: TSortField; direction: 'asc' | 'desc' };
	actions: BindingActions<TSortField>;
	TableFooterComponent?: React.ComponentType<BindingDataTableFooterProps>;
};

/** The source as the eight-observable binding: the Suspense resource and the streams. */
type StreamSource = {
	handle?: never;
	binding?: Pick<import('../../../../../query').QueryBinding, 'pending$' | 'exhausted$'>;
	resource: import('observable-hooks').ObservableResource<QueryResult<import('rxdb').RxCollection>>;
	active$: import('rxjs').Observable<boolean>;
	total$: import('rxjs').Observable<number | null>;
	sync: () => Promise<void>;
};

/**
 * The source as a query handle (roadmap#423): one snapshot, suspended on until the engine's
 * first answer (the screen's boundary draws the skeleton, as it does for the stream source), a
 * changed query keeping its rows while the next one suspends (`useDeferredValue(handle)`). The
 * footers still take streams, derived from the handle, until they move with their screens.
 */
type HandleSource = {
	handle: QueryHandle<QueryResult<import('rxdb').RxCollection>>;
	binding?: never;
	resource?: never;
	active$?: never;
	total$?: never;
	sync?: never;
};

type Props<TData extends RowData, TSortField extends string> = CommonProps<TData> &
	TableProps<TSortField> &
	(StreamSource | HandleSource);

/** What the body draws, whichever source it came from. */
type BodySource = {
	result: QueryResult<import('rxdb').RxCollection>;
	syncing: boolean;
	engine: { pending: boolean; exhausted: boolean | null };
	active$: import('rxjs').Observable<boolean>;
	total$: import('rxjs').Observable<number | null>;
	sync: () => Promise<void>;
	/** The default footer; the handle source supplies one that reads values in the same commit. */
	footer?: React.ComponentType<{ count: number }>;
};

type BodyProps<TData extends RowData, TSortField extends string> = CommonProps<TData> &
	TableProps<TSortField> &
	BodySource;

const NOT_PENDING$ = of(false);
const UNKNOWN_EXHAUSTED$ = of(null as boolean | null);
const TABLE_FIELDS = ['pending', 'exhausted'] as const;
const ACTIVE_FIELD = ['active'] as const;
const TOTAL_FIELD = ['total'] as const;

/**
 * The handle source's default footer: `total` from the drawn handle in the SAME commit as the
 * rows it counts (a stream's value lands one commit later), the spinner from the live one.
 */
function HandleFooter({
	collectionName,
	handle,
	shown,
	count,
}: {
	collectionName: DataTableCollectionKey;
	handle: QueryHandle<QueryResult<import('rxdb').RxCollection>>;
	shown: QueryHandle<QueryResult<import('rxdb').RxCollection>>;
	count: number;
}) {
	const { active } = useQueryHandleFields(handle, ACTIVE_FIELD);
	const { total } = useQueryHandleFields(shown, TOTAL_FIELD);
	return (
		<DataTableFooterFor
			collectionName={collectionName}
			active={active}
			total={total}
			sync={handle.sync}
			count={count}
		/>
	);
}

function DataTable<TData extends RowData, TSortField extends string = string>(
	props: Props<TData, TSortField>
) {
	return props.handle ? (
		<HandleDataTable<TData, TSortField> {...props} />
	) : (
		<StreamDataTable<TData, TSortField> {...props} />
	);
}

function StreamDataTable<TData extends RowData, TSortField extends string>(
	props: CommonProps<TData> & TableProps<TSortField> & StreamSource
) {
	const { resource, binding, active$, total$, sync, ...rest } = props;
	const result = useObservableSuspense(resource);
	const syncing = useObservableState(active$, false);
	const pending = useObservableState(binding?.pending$ ?? NOT_PENDING$, false);
	const exhausted = useObservableState(binding?.exhausted$ ?? UNKNOWN_EXHAUSTED$, null);
	return (
		<DataTableBody<TData, TSortField>
			{...rest}
			result={result}
			syncing={syncing}
			engine={{ pending, exhausted }}
			active$={active$}
			total$={total$}
			sync={sync}
		/>
	);
}

function HandleDataTable<TData extends RowData, TSortField extends string>(
	props: CommonProps<TData> & TableProps<TSortField> & HandleSource
) {
	const { handle, ...rest } = props;
	// Stale-while-loading: the deferred handle's rows stay while the new one suspends.
	const shown = React.useDeferredValue(handle);
	const settling = shown !== handle;
	const snapshot = useQuerySnapshot(shown, TABLE_FIELDS);
	// The spinner is the engine's now, whichever query is drawn.
	const { active } = useQueryHandleFields(handle, ACTIVE_FIELD);
	// Streams for the custom footer props that still take them (they subscribe themselves):
	// the spinner's from the live handle, the total's from the drawn one, like the values.
	const live = React.useMemo(() => bindingObservablesFor(handle), [handle]);
	const drawn = React.useMemo(() => bindingObservablesFor(shown), [shown]);
	const footer = React.useCallback(
		({ count }: { count: number }) => (
			<HandleFooter
				collectionName={props.collectionName}
				handle={handle}
				shown={shown}
				count={count}
			/>
		),
		[handle, props.collectionName, shown]
	);
	return (
		<DataTableBody<TData, TSortField>
			{...rest}
			result={snapshot.result}
			syncing={active}
			// A changed query that has not answered is in flight for paging (#1221).
			engine={{ pending: snapshot.pending || settling, exhausted: snapshot.exhausted }}
			active$={live.active$}
			total$={drawn.total$}
			sync={handle.sync}
			footer={footer}
		/>
	);
}

/** Skeleton rows shown in an empty list while the collection is still syncing: enough to read
 *  as a table filling, few enough that a store with three coupons does not flash a page. */
const SYNCING_SKELETON_ROWS = 5;

function DataTableBody<TData extends RowData, TSortField extends string = string>(
	props: BodyProps<TData, TSortField>
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
		listRef,
		noDataMessage,
		estimatedItemSize,
		showFooter = true,
		renderItem,
		cells,
		cellsForRow,
		renderHeader,
		persistSort = true,
		tableConfig,
		getItemType,
		ListFooterComponent,
		onEndReached,
	} = props;
	const pointer = usePointer();
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
	const { result, syncing, engine } = props;
	const deferredResult = React.useDeferredValue(result);
	// A deferred frame behind the answer is in flight for paging too: the guard must not judge
	// the new answer on the old hit count (#1221).
	const paging = {
		pending: engine.pending || deferredResult !== result,
		exhausted: engine.exhausted,
	};

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
			if (persistSort) void patchUI({ sortBy, sortDirection });
			props.actions.setSort(sortBy as TSortField, sortDirection);
		},
		[patchUI, persistSort, props.actions]
	);

	// Guarded (#1221): pending blocks; full local reads extend regardless of exhaustion.
	// Short local reads stop unless the engine says more may exist.
	const handleEndReached = useGuardedExtendLimitFor(
		props.actions.extendLimit,
		deferredResult.hits.length,
		paging
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
		// The header and rows sit on the one card surface (surface.tsx, ledger line 19); the footer
		// is a caption row on the ground beneath it, the same row the POS tile grid has, so the two
		// views share a footer and only the body differs.
		<View className="flex h-full flex-col">
			<TableSurface>
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
											// The rows give the last BODY cell the remainder only when no actions
											// column trails them (the actions cell keeps its configured width beside
											// the pressable); the header follows the same rule or drifts from the cells.
											last={
												index === headerGroup.headers.length - 1 &&
												!headerGroup.headers.some((h) => h.column.id === 'actions')
											}
											resizable={header.column.id !== 'actions'}
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
							ref={listRef}
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
							onEndReached={onEndReached ?? handleEndReached}
							ListEmptyComponent={() => {
								/* "No results" may only ever mean the search ANSWERED with nothing.
						   A pending search (index building, engine database not bound yet)
						   says so instead — rendering the ordinary empty state there reads
						   as "this record does not exist" (#1733). */
								const searchPending =
									deferredResult.searchActive && deferredResult.searchState === 'pending';
								/* An empty list while the collection is still pulling is not an empty
						   store either: the footer's sync spinner is running, and "No customers
						   yet" beside it told a fresh install it had no data while 5,454
						   customers were on their way. Rows in flight look like rows in flight
						   until the pull settles. */
								if (syncing && !searchPending) {
									return (
										<View testID="data-table-syncing-rows">
											<DataTableSkeletonRows id={id} rowCount={SYNCING_SKELETON_ROWS} />
										</View>
									);
								}
								return (
									<View className="justify-center p-6">
										{searchPending ? (
											<Text testID="search-pending-message">{t('common.searching')}</Text>
										) : React.isValidElement(noDataMessage) ? (
											noDataMessage
										) : (
											<Text testID="no-data-message">
												{noDataMessage ? noDataMessage : t('common.no_results_found')}
											</Text>
										)}
									</View>
								);
							}}
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
				</Table>
			</TableSurface>
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
					) : props.footer ? (
						<props.footer count={result.hits.length} />
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
		</View>
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
