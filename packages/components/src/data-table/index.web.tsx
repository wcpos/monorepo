import * as React from 'react';
import { NativeScrollEvent, NativeSyntheticEvent, RefreshControl, ScrollView } from 'react-native';

import {
	ColumnDef,
	ExpandedState,
	flexRender,
	getCoreRowModel,
	getExpandedRowModel,
	Row,
	useReactTable,
} from '@tanstack/react-table';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useObservableRef } from 'observable-hooks';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { setRefValue } from '../lib/set-ref-value';
import { DataTableRow } from './row';
import { getFlexAlign } from '../lib/utils';
import { Table, TableBody, TableHead, TableHeader, TableRow } from '../table';

import type { DataTableRowData } from './types';
import type {
	OnChangeFn,
	RowSelectionState,
	SortingState,
	TableState,
} from '@tanstack/react-table';

interface DataTableProps<TData extends DataTableRowData, TValue> {
	columns: ColumnDef<TData, TValue>[];
	data: TData[];
	onRowPress?: (row: Row<TData>) => void;
	estimatedItemSize?: number;
	isRefreshing?: boolean;
	onRefresh?: () => void;
	renderItem?: (info: { item: Row<TData>; index: number }) => React.ReactNode;
	extraContext?: Record<string, unknown>;
	tableMeta?: Record<string, unknown>;
	TableFooterComponent?: React.ComponentType<Record<string, unknown>>;
	tableState?: Partial<TableState>;
	enableRowSelection?: boolean;
	onRowSelectionChange?: OnChangeFn<RowSelectionState>;
	onSortingChange?: OnChangeFn<SortingState>;
	extraData?: Record<string, unknown>;
	onEndReached?: () => void;
}

const DataTableContext = React.createContext<any | undefined>(undefined);

const useDataTable = () => {
	const context = React.useContext(DataTableContext);
	if (!context) {
		throw new Error('useDataTable must be used within a DataTableContext.Provider');
	}
	return context;
};

const DataTable = <TData extends DataTableRowData, TValue>({
	columns,
	data,
	onRowPress,
	estimatedItemSize = 45,
	isRefreshing = false,
	onRefresh,
	renderItem,
	extraContext,
	tableMeta,
	TableFooterComponent,
	tableState,
	enableRowSelection,
	onRowSelectionChange,
	onSortingChange,
	extraData,
	onEndReached,
}: DataTableProps<TData, TValue>) => {
	const [expandedRef, expanded$] = useObservableRef({} as ExpandedState);

	const insets = useSafeAreaInsets();
	const table = useReactTable({
		data,
		columns,
		getCoreRowModel: getCoreRowModel(),
		getRowId: (row: TData) => row.id,
		getExpandedRowModel: getExpandedRowModel(),
		onExpandedChange: (updater) => {
			const value = typeof updater === 'function' ? updater(expandedRef.current) : updater;
			setRefValue(expandedRef, value);
		},
		getRowCanExpand: (row) => row.original.document.type === 'variable',
		meta: {
			expanded$,
			expandedRef,
			onChange: (data: unknown) => {
				console.log('onChange called without handler', data);
			},
			...tableMeta,
		},
		state: {
			...tableState,
		},
		enableRowSelection: !!enableRowSelection,
		onRowSelectionChange: onRowSelectionChange ? onRowSelectionChange : undefined,
		manualSorting: true,
		onSortingChange,
		// debugTable: true,
	});

	const handleRenderRow = React.useCallback(
		({ item: row, index }: { item: Row<TData>; index: number }) =>
			renderItem ? renderItem({ item: row, index }) : <DataTableRow row={row} index={index} />,
		[renderItem]
	);

	const context = React.useMemo(() => ({ table, ...extraContext }), [table, extraContext]);

	/**
	 * On web, ScrollView renders as an HTMLDivElement.
	 * We use the DOM type so the virtualizer and clientHeight work correctly.
	 */
	const scrollRef = React.useRef<HTMLDivElement>(null);
	const scrollPositionRef = React.useRef(0);

	/**
	 * Virtualizer for the table
	 */
	const virtualizer = useVirtualizer({
		count: table.getRowModel().rows.length,
		getItemKey: (index) => table.getRowModel().rows[index].id,
		getScrollElement: () => scrollRef.current,
		estimateSize: () => estimatedItemSize,
		measureElement:
			typeof window !== 'undefined' && navigator.userAgent.indexOf('Firefox') === -1
				? (element: Element) => element?.getBoundingClientRect().height
				: undefined,
		overscan: 5,
		// debug: true,
	});

	/**
	 * Adjust scroll position when item sizes change, but only if the change
	 * affects the currently visible viewport area.
	 *
	 * This property is on the Virtualizer class but not in VirtualizerOptions,
	 * so it must be set after construction. The mutation is intentional API usage.
	 */
	// eslint-disable-next-line react-compiler/react-compiler
	virtualizer.shouldAdjustScrollPositionOnItemSizeChange = (item, _delta, instance) => {
		const scrollOffset = instance.scrollOffset ?? 0;
		const scrollHeight = instance.scrollRect?.height ?? 0;
		const viewportEnd = scrollOffset + scrollHeight;

		return item.start < viewportEnd && item.end > scrollOffset;
	};

	/**
	 * Handler to detect when the scroll is near the bottom
	 */
	const handleScroll = React.useCallback(
		({ nativeEvent }: NativeSyntheticEvent<NativeScrollEvent>) => {
			scrollPositionRef.current = nativeEvent.contentOffset.y; // Save the current scroll position

			const offsetY = nativeEvent.contentOffset.y;
			const contentHeight = nativeEvent.contentSize.height;
			const layoutHeight = nativeEvent.layoutMeasurement.height;

			if (offsetY + layoutHeight >= contentHeight - 500) {
				if (typeof onEndReached === 'function') {
					onEndReached();
				}
			}
		},
		[onEndReached]
	);

	/**
	 * Load more data when the content size changes, if the content is less than the scroll view's height
	 */
	const handleContentSizeChange = React.useCallback(
		(width: number, height: number) => {
			if (scrollRef && scrollRef.current) {
				if (height < scrollRef.current?.clientHeight && typeof onEndReached === 'function') {
					onEndReached();
				}
			}
		},
		[onEndReached]
	);

	/**
	 * Restore scroll position after data updates
	 */
	React.useEffect(() => {
		if (scrollRef.current && scrollPositionRef.current !== 0) {
			scrollRef.current.scrollTo({ top: scrollPositionRef.current, behavior: 'instant' });
		}
	}, [data]);

	/**
	 *
	 */
	return (
		<DataTableContext.Provider value={context}>
			<Table className="flex-1">
				<TableHeader>
					{table.getHeaderGroups().map((headerGroup) => (
						<TableRow key={headerGroup.id}>
							{headerGroup.headers.map((header) => {
								const meta = header.column.columnDef.meta;

								return (
									<TableHead
										key={header.id}
										style={{
											flexGrow: meta?.width ? 0 : meta?.flex ? meta.flex : 1,
											flexBasis: meta?.width ? meta.width : undefined,
											alignItems: getFlexAlign(meta?.align || 'left'),
										}}
									>
										{header.isPlaceholder || meta?.hideLabel
											? null
											: flexRender(header.column.columnDef.header, header.getContext())}
									</TableHead>
								);
							})}
						</TableRow>
					))}
				</TableHeader>
				<TableBody>
					<ScrollView
						ref={scrollRef as unknown as React.RefObject<ScrollView>}
						scrollEventThrottle={100}
						onScroll={handleScroll}
						refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} />}
						contentContainerStyle={{
							paddingBottom: insets.bottom,
							position: 'relative',
							height: virtualizer.getTotalSize(),
						}}
						onContentSizeChange={handleContentSizeChange}
					>
						{virtualizer.getVirtualItems().map((virtualItem) => {
							const row = table.getRowModel().rows[virtualItem.index];
							return (
								<div
									data-index={virtualItem.index}
									ref={(node) => virtualizer.measureElement(node)}
									key={row.id}
									style={{
										position: 'absolute',
										transform: `translateY(${virtualItem.start}px)`,
										width: '100%',
									}}
								>
									{handleRenderRow({
										item: row,
										index: virtualItem.index,
									})}
								</div>
							);
						})}
					</ScrollView>
				</TableBody>
			</Table>
			{TableFooterComponent && <TableFooterComponent />}
		</DataTableContext.Provider>
	);
};

export { DataTable, DataTableRow, useDataTable };
export type { DataTableProps };
