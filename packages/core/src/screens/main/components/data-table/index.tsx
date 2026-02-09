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

import type { ColumnDef } from '@tanstack/react-table';

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
	renderHeader?: (props: any) => React.ReactNode;
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

	const sorting = React.useMemo(
		() => [{ sortBy: uiSettings.sortBy, sortDirection: uiSettings.sortDirection }],
		[uiSettings.sortBy, uiSettings.sortDirection]
	);

	/**
	 * Sorting
	 */
	const handleSortingChange = React.useCallback(
		({ sortBy, sortDirection }: { sortBy: string; sortDirection: 'asc' | 'desc' }) => {
			patchUI({ sortBy, sortDirection });
			query.sort([{ [sortBy]: sortDirection }]).exec();
		},
		[patchUI, query]
	);

	const table = useReactTableWrapper({
		columns,
		data: deferredResult.hits,
		getRowId: (row: { id: string; document: TData }) => row.id,
		getCoreRowModel: getCoreRowModel(),
		onSortingChange: handleSortingChange,
		manualSorting: true,
		...tableConfig,
		state: { columnVisibility, sorting, ...tableConfig?.state },
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
							<TableHead key={header.id} style={getColumnStyle(header.column.columnDef.meta)}>
								{renderHeader ? (
									renderHeader({
										...header,
										table,
									})
								) : (
									<DataTableHeader
										{...header.getContext()}
										title={String(header.column.columnDef.header ?? '')}
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
					onEndReached={() => {
						if (query.infiniteScroll) {
							query.loadMore();
						}
					}}
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

export { DataTable, DataTableHeader, DataTableFooter, defaultRenderItem, getColumnStyle };
