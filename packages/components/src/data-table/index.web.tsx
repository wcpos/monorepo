import * as React from 'react';
import {
	LayoutChangeEvent,
	NativeScrollEvent,
	NativeSyntheticEvent,
	RefreshControl,
	ScrollView,
	View,
} from 'react-native';

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

import { DataTableRow } from './row';
import { getFlexAlign } from '../lib/utils';
import { Table, TableBody, TableHead, TableHeader, TableRow } from '../table';

interface DataTableProps<TData, TValue> {
	columns: ColumnDef<TData, TValue>[];
	data: TData[];
	onRowPress?: (row: Row<TData>) => void;
	estimatedItemSize?: number;
	isRefreshing?: boolean;
	onRefresh?: () => void;
	renderItem?: ({ item, index }: { item: Row<TData>; index: number }) => React.ReactNode;
	extraContext?: Record<string, any>;
	tableMeta?: Record<string, any>;
	TableFooterComponent?: React.ComponentType<any>;
	tableState?: any;
	enableRowSelection?: boolean;
	onRowSelectionChange?: (newRowSelection: any) => void;
	onSortingChange?: (updaterOrValue: any) => void;
	extraData?: any;
	onEndReached?: () => void;
	[key: string]: any;
}

const DataTableContext = React.createContext<any | undefined>(undefined);

const useDataTable = () => {
	const context = React.useContext(DataTableContext);
	if (!context) {
		throw new Error('useDataTable must be used within a DataTableContext.Provider');
	}
	return context;
};

const DataTable = <TData, TValue>({
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
	...props
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
			expandedRef.current = value;
		},
		getRowCanExpand: (row) => row.original.document.type === 'variable',
		meta: {
			expanded$,
			expandedRef,
			onChange: (data: any) => {
				console.log('onChange called without handler', data);
			},
			...tableMeta,
		},
		state: {
			sorting: {
				sortBy: 'name',
				sortDirection: 'asc',
			},
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

	const extraDataWithTimestamp = React.useMemo(
		() => ({ ...(extraData || {}), timestamp: Date.now() }),
		[extraData, columns]
	);

	const scrollRef = React.useRef<ScrollView>(null);
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
				? (element) => element?.getBoundingClientRect().height
				: undefined,
		overscan: 5,
		// debug: true,
	});

	virtualizer.shouldAdjustScrollPositionOnItemSizeChange = (item, delta, context) => {
		const scrollOffset = context.getScrollOffset();
		const viewportEnd = scrollOffset + context.options.size;

		// Only adjust if the item's size change affects the viewport
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
			scrollRef.current.scrollTo({ y: scrollPositionRef.current, animated: false });
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
						ref={scrollRef}
						scrollEventThrottle={100}
						onScroll={handleScroll}
						refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} />}
						contentContainerStyle={{
							paddingBottom: insets.bottom,
							position: 'relative',
							height: virtualizer.getTotalSize(),
						}}
						onContentSizeChange={handleContentSizeChange}
						{...props}
					>
						{virtualizer.getVirtualItems().map((virtualItem) => {
							const row = table.getRowModel().rows[virtualItem.index];
							return (
								<View
									dataSet={{ index: virtualItem.index }}
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
								</View>
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
