import * as React from 'react';
import type { FlexAlignType, ViewStyle } from 'react-native';

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
import { useObservableEagerState, useObservableSuspense } from 'observable-hooks';
import { find } from 'lodash';

import {
	Table,
	TableBody,
	TableCell,
	TableFooter,
	TableHead,
	TableHeader,
	TableRow,
} from '@wcpos/components/table';
import { ErrorBoundary } from '@wcpos/components/error-boundary';
import { Suspense } from '@wcpos/components/suspense';
import { Text } from '@wcpos/components/text';
import * as VirtualizedList from '@wcpos/components/virtualized-list';
import type { QueryResult } from '@wcpos/query';

import { useGuardedExtendLimit } from '../../../../query';
import { UISettingID, useUISettings } from '../../contexts/ui-settings';
import { TextCell } from '../../components/text-cell';
import { useT } from '../../../../contexts/translations';
import { DataTableHeader } from './header';
import { DataTableFooter } from './footer';
import { ListFooterComponent as DefaultListFooterComponent } from './list-footer';

import type { SortingChange } from './sort-field';
import type { CollectionKey as QueryCollectionKey } from '../../../../query';
import type { RowData } from '@tanstack/react-table';
import type { ColumnDef, Header, Table as TanStackTable } from '../../../../table-types';

const dataTableFeatures = tableFeatures({
	columnVisibilityFeature,
	rowSortingFeature,
	rowExpandingFeature,
	expandedRowModel: createExpandedRowModel(),
	rowSelectionFeature,
});

type DataTableFeatures = typeof dataTableFeatures;
type DataTableRow = QueryResult<import('rxdb').RxCollection>['hits'][number];

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

interface CommonProps {
	id: UISettingID;
	noDataMessage?: string;
	estimatedItemSize?: number;
	showFooter?: boolean;
	renderItem?: (params: {
		item: any;
		index: number;
		table: any;
	}) => React.ReactElement<React.ComponentProps<typeof VirtualizedList.Item>>;
	renderCell?: (columnKey: string, info: any) => React.ReactNode;
	renderHeader?: (props: RenderHeaderProps) => React.ReactNode;
	tableConfig?: any;
	getItemType?: (row: any) => string;
	ListFooterComponent?: React.ComponentType<any>;
}

type BindingProps<TSortField extends string> = {
	collectionName: DataTableCollectionKey;
	resource: import('observable-hooks').ObservableResource<QueryResult<import('rxdb').RxCollection>>;
	sort: { field: TSortField; direction: 'asc' | 'desc' };
	actions: BindingActions<TSortField>;
	TableFooterComponent?: React.ComponentType<BindingDataTableFooterProps>;
	active$: import('rxjs').Observable<boolean>;
	total$: import('rxjs').Observable<number>;
	totalSource$: import('rxjs').Observable<'coverage' | 'local'>;
	sync: () => Promise<void>;
};

type Props<TSortField extends string> = CommonProps & BindingProps<TSortField>;

function DataTable<TData extends RowData, TSortField extends string = string>(
	props: Props<TSortField>
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
		renderCell,
		renderHeader,
		tableConfig,
		getItemType,
		ListFooterComponent,
	} = props;
	const resource = props.resource;
	const { uiSettings, getUILabel, patchUI } = useUISettings(id);
	const uiColumns = useObservableEagerState(
		uiSettings.columns$ as import('rxjs').Observable<Record<string, unknown>[]>
	);
	const t = useT();
	const result = useObservableSuspense(resource);
	const deferredResult = React.useDeferredValue(result);

	const columns = React.useMemo(
		() => buildColumns(uiColumns, getUILabel, renderCell),
		[uiColumns, getUILabel, renderCell]
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

	// Guarded (#1221): a short page is the true end, and an outstanding extension must land
	// before the next one fires — unguarded end-reached churn recompiled the search demand
	// per step and abort/re-issued identical wire requests.
	const handleEndReached = useGuardedExtendLimit(
		props.actions.extendLimit,
		deferredResult.hits.length
	);

	const table = useTable<DataTableFeatures, DataTableRow>({
		features: dataTableFeatures,
		columns,
		data: deferredResult.hits,
		getRowId: (row) => row.id,
		...tableConfig,
		state: { columnVisibility, ...tableConfig?.state },
		meta: {
			...tableConfig?.meta,
			actions: { setFilter: props.actions.setFilter },
		},
	});

	/**
	 * Extra data is needed to force a re-render of FlashList on certain state changes
	 */
	const extraData = React.useMemo(() => {
		return {
			columnVisibility,
			tableConfig: tableConfig?.extraData,
		};
	}, [columnVisibility, tableConfig?.extraData]);

	return (
		<Table className="flex h-full flex-col">
			<TableHeader>
				{table.getHeaderGroups().map((headerGroup) => (
					<TableRow key={headerGroup.id}>
						{headerGroup.headers.map((header) => (
							<TableHead key={header.id} style={getHeaderStyle(header.column.columnDef.meta)}>
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
							</TableHead>
						))}
					</TableRow>
				))}
			</TableHeader>
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
						<TableRow className="justify-center p-2">
							<Text testID="no-data-message">
								{noDataMessage ? noDataMessage : t('common.no_results_found')}
							</Text>
						</TableRow>
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
							totalSource$={props.totalSource$}
							sync={props.sync}
							count={result.hits.length}
						/>
					) : (
						<DataTableFooter
							collectionName={props.collectionName}
							active$={props.active$}
							total$={props.total$}
							totalSource$={props.totalSource$}
							sync={props.sync}
							count={result.hits.length}
						/>
					)}
				</TableFooter>
			)}
		</Table>
	);
}

function getRowTestID(item: any) {
	const document = item?.original?.document;
	// Woo numeric ids can appear after a create ack; the adapter uuid/hit id is stable for the row.
	const stableId = document?.slug ?? document?.uuid ?? item?.id;
	return stableId !== null && stableId !== undefined && stableId !== ''
		? `data-table-row-${stableId}`
		: undefined;
}

function defaultRenderItem({ item, index, table }: { item: any; index: number; table: any }) {
	return (
		<VirtualizedList.Item>
			<TableRow testID={getRowTestID(item)} index={index}>
				{item.getVisibleCells().map((cell: any) => {
					return (
						<TableCell key={cell.id} style={getColumnStyle(cell.column.columnDef.meta)}>
							<ErrorBoundary>
								<Suspense>{flexRender(cell.column.columnDef.cell, cell.getContext())}</Suspense>
							</ErrorBoundary>
						</TableCell>
					);
				})}
			</TableRow>
		</VirtualizedList.Item>
	);
}

function buildColumns(
	columns: any,
	getUILabel: (key: string) => string,
	renderCell?: (columnKey: string, info: any) => React.ReactNode
): ColumnDef<any, any, DataTableFeatures>[] {
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
			cell: (info: any) => (renderCell ? renderCell(c.key, info) : <TextCell {...info} />),
			header: c.hideLabel ? '' : getUILabel(c.key),
		};
	});
}

function getFlexAlign(align: 'left' | 'right' | 'center'): FlexAlignType {
	switch (align) {
		case 'left':
			return 'flex-start';
		case 'right':
			return 'flex-end';
		case 'center':
			return 'center';
		default:
			return 'flex-start';
	}
}

function getColumnStyle(meta: any): ViewStyle {
	if (meta?.width) {
		return {
			flexGrow: 0,
			flexShrink: 0,
			flexBasis: meta.width,
			alignItems: getFlexAlign(meta.align || 'left'),
		};
	}
	return {
		flexGrow: meta?.flex ?? 1,
		flexShrink: 0,
		flexBasis: '0%',
		alignItems: getFlexAlign(meta?.align || 'left'),
	};
}

function getHeaderStyle(meta: any): ViewStyle {
	if (meta?.width) {
		return {
			flexGrow: 0,
			flexShrink: 0,
			flexBasis: meta.width,
			alignItems: getFlexAlign(meta.align || 'left'),
		};
	}
	return {
		flexGrow: meta?.flex ?? 1,
		flexShrink: 0,
		flexBasis: '0%',
		alignItems: getFlexAlign(meta?.align || 'left'),
	};
}

export {
	DataTable,
	DataTableHeader,
	DataTableFooter,
	defaultRenderItem,
	getColumnStyle,
	getHeaderStyle,
};
export type { RenderHeaderProps, SortingChange };
export type { BindingDataTableFooterProps };
export type { DataTableFeatures };
