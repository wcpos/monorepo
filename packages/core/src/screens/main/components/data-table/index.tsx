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
import type { ColumnDef, Header, Table as TanStackTable } from '@tanstack/react-table';

interface RenderHeaderProps<TData = unknown> extends Header<TData, unknown> {
	table: TanStackTable<TData>;
	sortBy: string;
	sortDirection: 'asc' | 'desc';
	onSortingChange: (sort: SortingChange) => void;
}

interface Props {
	id: UISettingID;
	query: Query<any>;
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

/**
 * React Compiler breaks tanstack/react-table
 * https://github.com/facebook/react/issues/33057
 */
function useReactTableWrapper(...args: Parameters<typeof useReactTable>) {
	'use no memo';
	return { ...useReactTable(...args) };
}

function DataTable<TData>({
	id,
	query,
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
}: Props) {
	const { uiSettings, getUILabel, patchUI } = useUISettings(id);
	const uiColumns = useObservableEagerState(
		uiSettings.columns$ as import('rxjs').Observable<Record<string, unknown>[]>
	);
	const t = useT();
	const result = useObservableSuspense(query.resource);
	const deferredResult = React.useDeferredValue(result);

	const columns = React.useMemo(
		() => buildColumns(uiColumns, getUILabel, renderCell),
		[uiColumns, getUILabel, renderCell]
	);

	const columnVisibility = React.useMemo(
		() => Object.fromEntries(uiColumns.map((c) => [c.key, c.show])),
		[uiColumns]
	);

	const sortBy = uiSettings.sortBy;
	const sortDirection: 'asc' | 'desc' = uiSettings.sortDirection === 'desc' ? 'desc' : 'asc';

	const handleSortingChange = React.useCallback(
		({ sortBy, sortDirection }: SortingChange) => {
			patchUI({ sortBy, sortDirection });
			query.sort([{ [sortBy]: sortDirection }]).exec();
		},
		[patchUI, query]
	);

	const handleEndReached = React.useCallback(() => {
		if (query.infiniteScroll) {
			query.loadMore();
		}
	}, [query]);

	const table = useReactTableWrapper({
		columns,
		data: deferredResult.hits,
		getRowId: (row: { id: string; document: TData }) => row.id,
		getCoreRowModel: getCoreRowModel(),
		...tableConfig,
		state: { columnVisibility, ...tableConfig?.state },
		meta: {
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
							? () => <ListFooterComponent query={query} />
							: () => <DefaultListFooterComponent query={query} />
					}
					extraData={extraData}
				/>
			</VirtualizedList.Root>
			{showFooter && (
				<TableFooter>
					{TableFooterComponent ? (
						<TableFooterComponent query={query} count={result.hits.length} />
					) : (
						<DataTableFooter query={query} count={result.hits.length} />
					)}
				</TableFooter>
			)}
		</Table>
	);
}

function defaultRenderItem({ item, index, table }: { item: any; index: number; table: any }) {
	return (
		<VirtualizedList.Item>
			<TableRow index={index}>
				{item.getVisibleCells().map((cell: any) => {
					return (
						<TableCell key={cell.id} style={getColumnStyle(cell.column.columnDef.meta)}>
							{flexRender(cell.column.columnDef.cell, cell.getContext())}
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

/**
 * Header cells use DataTableHeader which handles alignment internally via items-* classes.
 * Excluding alignItems here prevents it from conflicting with the header's flex-col
 * justify-center layout on Electron/web.
 */
function getHeaderStyle(meta: any): ViewStyle {
	if (meta?.width) {
		return { flexGrow: 0, flexShrink: 0, flexBasis: meta.width };
	}
	return { flexGrow: meta?.flex ?? 1, flexShrink: 0, flexBasis: '0%' };
}

export { DataTable, DataTableHeader, DataTableFooter, defaultRenderItem, getColumnStyle };
export type { RenderHeaderProps, SortingChange };
