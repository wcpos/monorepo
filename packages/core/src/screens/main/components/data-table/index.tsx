import * as React from 'react';
import type { FlexAlignType, ViewStyle } from 'react-native';

import { flexRender, getCoreRowModel, useReactTable } from '@tanstack/react-table';
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
import type { Query } from '@wcpos/query';

import { UISettingID, useUISettings } from '../../contexts/ui-settings';
import { TextCell } from '../../components/text-cell';
import { useT } from '../../../../contexts/translations';
import { DataTableHeader } from './header';
import { DataTableFooter } from './footer';
import { ListFooterComponent as DefaultListFooterComponent } from './list-footer';

import type { SortingChange } from './sort-field';
import type { CollectionKey } from '../../hooks/use-collection';
import type { ColumnDef, Header, Table as TanStackTable } from '@tanstack/react-table';

interface RenderHeaderProps<TData = unknown> extends Header<TData, unknown> {
	table: TanStackTable<TData>;
	sortBy: string;
	sortDirection: 'asc' | 'desc';
	onSortingChange: (sort: SortingChange) => void;
}

type ReplicationBinding = ReturnType<typeof import('@wcpos/query').useReplicationState>;

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
	TableFooterComponent?: React.ComponentType<any>;
}

type LegacyQueryProps = {
	query: Query<any>;
	resource?: never;
	actions?: never;
	active$?: never;
	total$?: never;
	totalSource$?: never;
	sync?: never;
};

type BindingProps<TSortField extends string> = {
	query?: never;
	resource: Query<import('rxdb').RxCollection>['resource'];
	sort: { field: TSortField; direction: 'asc' | 'desc' };
	actions: BindingActions<TSortField>;
} & Pick<ReplicationBinding, 'active$' | 'total$' | 'totalSource$' | 'sync'>;

type Props<TSortField extends string> = CommonProps & (LegacyQueryProps | BindingProps<TSortField>);

function isBindingProps<TSortField extends string>(
	props: Props<TSortField>
): props is CommonProps & BindingProps<TSortField> {
	return props.resource !== undefined;
}

/**
 * React Compiler breaks tanstack/react-table
 * https://github.com/facebook/react/issues/33057
 */
function useReactTableWrapper(...args: Parameters<typeof useReactTable>) {
	'use no memo';
	return { ...useReactTable(...args) };
}

function DataTable<TData, TSortField extends string = string>(props: Props<TSortField>) {
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
		TableFooterComponent,
	} = props;
	const binding = isBindingProps(props) ? props : undefined;
	const query = binding ? undefined : props.query;
	const resource = binding ? binding.resource : query!.resource;
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

	const sortBy = binding ? binding.sort.field : uiSettings.sortBy;
	const sortDirection: 'asc' | 'desc' = binding
		? binding.sort.direction
		: uiSettings.sortDirection === 'desc'
			? 'desc'
			: 'asc';

	const handleSortingChange = React.useCallback(
		({ sortBy, sortDirection }: SortingChange) => {
			patchUI({ sortBy, sortDirection });
			if (binding) {
				binding.actions.setSort(sortBy as TSortField, sortDirection);
			} else {
				query!.sort([{ [sortBy]: sortDirection }]).exec();
			}
		},
		[binding, patchUI, query]
	);

	const handleEndReached = React.useCallback(() => {
		if (binding) {
			binding.actions.extendLimit();
		} else if (query!.infiniteScroll) {
			query!.loadMore();
		}
	}, [binding, query]);

	const table = useReactTableWrapper({
		columns,
		data: deferredResult.hits,
		getRowId: (row: { id: string; document: TData }) => row.id,
		getCoreRowModel: getCoreRowModel(),
		...tableConfig,
		state: { columnVisibility, ...tableConfig?.state },
		meta: binding
			? {
					...tableConfig?.meta,
					actions: { setFilter: binding.actions.setFilter },
				}
			: {
					query,
					...tableConfig?.meta,
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
										...header,
										table,
										sortBy,
										sortDirection,
										onSortingChange: handleSortingChange,
									})
								) : (
									<DataTableHeader
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
			<VirtualizedList.Root style={{ flex: 1 }}>
				<VirtualizedList.List
					data={table.getRowModel().rows}
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
					ListFooterComponent={
						ListFooterComponent
							? () =>
									binding ? (
										<ListFooterComponent active$={binding.active$} />
									) : (
										<ListFooterComponent query={query} />
									)
							: () =>
									binding ? (
										<DefaultListFooterComponent active$={binding.active$} />
									) : (
										<DefaultListFooterComponent query={query!} />
									)
					}
					extraData={extraData}
				/>
			</VirtualizedList.Root>
			{showFooter && (
				<TableFooter>
					{TableFooterComponent ? (
						binding ? (
							<TableFooterComponent
								active$={binding.active$}
								total$={binding.total$}
								totalSource$={binding.totalSource$}
								sync={binding.sync}
								count={result.hits.length}
							/>
						) : (
							<TableFooterComponent query={query} count={result.hits.length} />
						)
					) : binding ? (
						<DataTableFooter
							collectionName={id as CollectionKey}
							active$={binding.active$}
							total$={binding.total$}
							totalSource$={binding.totalSource$}
							sync={binding.sync}
							count={result.hits.length}
						/>
					) : (
						<DataTableFooter query={query!} count={result.hits.length} />
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
): ColumnDef<any, any>[] {
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
