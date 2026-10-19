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
import { find } from 'lodash';

import { usePointer } from '@wcpos/components/lib/device';
import { Table, TableBody, TableFooter, TableHeader, TableRow } from '@wcpos/components/table';
import { Text } from '@wcpos/components/text';
import * as VirtualizedList from '@wcpos/components/virtualized-list';
import type { QueryHandle, QueryResult } from '@wcpos/query';
import { useDocField } from '@wcpos/query';

import {
	useDrawnHandle,
	useGuardedExtendLimit,
	useQueryHandleFields,
	useQuerySnapshot,
} from '../../../../query';
import { UISettingID, useUISettings } from '../../contexts/ui-settings';
import { RecordTextCell } from '../record-text-cell';
import { useT } from '../../../../contexts/translations';
import { DataTableHeader } from './header';
import { DataTableFooter } from './footer';
import { ListFooterComponent as DefaultListFooterComponent } from './list-footer';
import { getRowTestID, DataTableRow as RowView } from './rows';
import { ResizeHead } from './resize';
import { DataTableSkeletonRows } from './skeleton';
import { getColumnStyle } from './column-style';
import { CaptionRowInset, TableSurface } from './surface';

import type { DataTableFooterProps } from './footer';
import type { TableSurfaceGutter } from './surface';
import type { SortingChange } from './sort-field';
import type { CollectionKey as QueryCollectionKey } from '../../../../query';
import type { RowData, TableOptions } from '@tanstack/react-table';
import type { ColumnDef, Header, Row, Table as TanStackTable } from '../../../../table-types';

const dataTableFeatures = tableFeatures({
	columnVisibilityFeature,
	rowSortingFeature,
	rowExpandingFeature,
	expandedRowModel: createExpandedRowModel(),
	rowSelectionFeature,
});

type DataTableFeatures = typeof dataTableFeatures;
type DataTableRow = QueryResult['hits'][number];
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

interface TableActions<TSortField extends string> {
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
	columnLabels?: Record<string, string>;
	cellsForRow?: (row: Row<TData, DataTableFeatures>) => CellMap;
	renderHeader?: (props: RenderHeaderProps) => React.ReactNode;
	/** Off for a table that borrows another's settings id (the variations pane): a header sort must not rewrite the products sort. */
	persistSort?: boolean;
	tableConfig?: DataTableConfig<TData>;
	getItemType?: (row: any) => string;
	/** Under the last row; handed the live handle's `active` as a value. */
	ListFooterComponent?: React.ComponentType<{ active: boolean }>;
	/**
	 * Replaces the table's own end-reached (`actions.extendLimit` behind its guard) for a caller
	 * that guards and arms its paging itself (a browse level, which pages on its own rows and
	 * re-fires an end-reached the guard ignored while pending).
	 */
	onEndReached?: () => void;
	/** The card's inset: `page` on a management page (16), `dense` in a dense pane (8, the POS). */
	gutter?: TableSurfaceGutter;
}

type TableProps<TSortField extends string> = {
	collectionName: DataTableCollectionKey;
	sort: { field: TSortField; direction: 'asc' | 'desc' };
	actions: TableActions<TSortField>;
	/** Replaces the default footer; handed values only (`DataTableFooterProps`). */
	TableFooterComponent?: React.ComponentType<DataTableFooterProps>;
};

type RowsHandle = QueryHandle<QueryResult>;

/**
 * The source is a query handle (roadmap#423): one snapshot, suspended on until the engine's
 * first answer (the screen's boundary draws the skeleton), a changed query keeping its rows
 * while the next one suspends (`useDrawnHandle`).
 */
type Props<TData extends RowData, TSortField extends string> = CommonProps<TData> &
	TableProps<TSortField> & { handle: RowsHandle };

/** What the body draws: the drawn snapshot's rows, and the two handles its footer reads. */
type BodyProps<TData extends RowData, TSortField extends string> = CommonProps<TData> &
	TableProps<TSortField> & {
		result: QueryResult;
		syncing: boolean;
		paging: { pending: boolean; exhausted: boolean | null };
		/** The live handle: the spinner and the sync button are the engine's now. */
		handle: RowsHandle;
		/** The drawn handle: the total rides with the rows it counts. */
		shown: RowsHandle;
	};

const TABLE_FIELDS = ['pending', 'exhausted'] as const;
const ACTIVE_FIELD = ['active'] as const;
const TOTAL_FIELD = ['total'] as const;

/**
 * The footer row, default or the caller's: `total` from the drawn handle in the SAME commit as
 * the rows it counts, the spinner from the live one. Read here, not in the body, so the body
 * does not re-render when the census lands.
 */
function HandleFooter({
	Footer,
	collectionName,
	handle,
	shown,
	drawnCount,
}: {
	Footer: React.ComponentType<DataTableFooterProps>;
	collectionName: DataTableCollectionKey;
	handle: RowsHandle;
	shown: RowsHandle;
	drawnCount: number;
}) {
	const { active } = useQueryHandleFields(handle, ACTIVE_FIELD);
	const { total } = useQueryHandleFields(shown, TOTAL_FIELD);
	return (
		<Footer
			collectionName={collectionName}
			active={active}
			total={total}
			sync={handle.sync}
			drawnCount={drawnCount}
		/>
	);
}

function DataTable<TData extends RowData, TSortField extends string = string>(
	props: Props<TData, TSortField>
) {
	const { handle, ...rest } = props;
	// Stale-while-loading: the drawn (previous) handle's rows stay while the new one suspends.
	const shown = useDrawnHandle(handle);
	const settling = shown !== handle;
	const snapshot = useQuerySnapshot(shown, TABLE_FIELDS);
	// The spinner is the engine's now, whichever query is drawn.
	const { active } = useQueryHandleFields(handle, ACTIVE_FIELD);
	return (
		<DataTableBody<TData, TSortField>
			{...rest}
			result={snapshot.result}
			syncing={active}
			// A changed query that has not answered is in flight for paging (#1221).
			paging={{ pending: snapshot.pending || settling, exhausted: snapshot.exhausted }}
			// Handles as data, not a component per handle: the footer (and its sync button's
			// state) stays mounted across a query change.
			handle={handle}
			shown={shown}
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
		columnLabels,
		renderHeader,
		persistSort = true,
		tableConfig,
		getItemType,
		ListFooterComponent,
		onEndReached,
		gutter = 'dense',
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
	const { result, syncing, paging: queryPaging } = props;
	const deferredResult = React.useDeferredValue(result);
	// A deferred frame behind the answer is in flight for paging too: the guard must not judge
	// the new answer on the old hit count (#1221).
	const paging = {
		pending: queryPaging.pending || deferredResult !== result,
		exhausted: queryPaging.exhausted,
	};

	const columns = React.useMemo(
		() => buildColumns(uiColumns, getUILabel, cells, cellsForRow, columnLabels),
		[uiColumns, getUILabel, cells, cellsForRow, columnLabels]
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
	const handleEndReached = useGuardedExtendLimit(
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
			<TableSurface gutter={gutter}>
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
													header={flexRender(header.column.columnDef.header, header.getContext())}
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
									<ListFooterComponent active={syncing} />
								) : (
									<DefaultListFooterComponent active={syncing} />
								)
							}
							extraData={extraData}
						/>
					</VirtualizedList.Root>
				</Table>
			</TableSurface>
			{showFooter && (
				<TableFooter>
					{/* The footer's text lines up with the cells' by the card's own gutter (surface.tsx). */}
					<CaptionRowInset gutter={gutter}>
						<HandleFooter
							Footer={props.TableFooterComponent ?? DataTableFooter}
							collectionName={props.collectionName}
							handle={props.handle}
							shown={props.shown}
							drawnCount={result.hits.length}
						/>
					</CaptionRowInset>
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
	cellsForRow?: (row: Row<TData, DataTableFeatures>) => CellMap,
	columnLabels?: Record<string, string>
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
			header: c.hideLabel ? '' : (columnLabels?.[c.key] ?? getUILabel(c.key)),
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
export type { DataTableFooterProps };
export type { CellComponent, DataTableFeatures };
