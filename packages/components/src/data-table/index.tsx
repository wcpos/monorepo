import * as React from 'react';
import { ActivityIndicator, Dimensions, RefreshControl, ScrollView } from 'react-native';

import { FlashList, type FlashListProps } from '@shopify/flash-list';
import {
	ColumnDef,
	flexRender,
	getCoreRowModel,
	useReactTable,
	Row,
	getExpandedRowModel,
	ExpandedState,
} from '@tanstack/react-table';
import { useObservableRef } from 'observable-hooks';
import Animated, { FadeInUp, FadeOutUp } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DataTableRow } from './row';
import { cn, getTailwindJustifyClass } from '../lib/utils';
import { Table, TableBody, TableHead, TableHeader, TableRow } from '../table';

interface DataTableProps<TData, TValue> {
	columns: ColumnDef<TData, TValue>[];
	data: TData[];
	onRowPress?: (row: Row<TData>) => void;
	estimatedItemSize?: number;
	ListEmptyComponent?: FlashListProps<TData>['ListEmptyComponent'];
	ListFooterComponent?: FlashListProps<TData>['ListFooterComponent'];
	isRefreshing?: boolean;
	onRefresh?: () => void;
	onEndReached?: FlashListProps<TData>['onEndReached'];
	onEndReachedThreshold?: FlashListProps<TData>['onEndReachedThreshold'];
	renderItem?: FlashListProps<TData>['renderItem'];
	/**
	 * Made available to any children via the DataTableContext
	 */
	extraContext?: Record<string, any>;
	/**
	 * Made available to the table instance
	 */
	tableMeta?: Record<string, any>;
	TableFooterComponent?: React.ComponentType<any>;
}

const DataTableContext = React.createContext<any | undefined>(undefined);

const useDataTable = () => {
	const context = React.useContext(DataTableContext);
	if (!context) {
		throw new Error('useDataTable must be used within a DataTableContext.Provider');
	}
	return context;
};

/**
 * Tables are expensive to render, so memoize all props.
 *
 * @docs https://tanstack.com/table
 * @docs https://shopify.github.io/flash-list/
 */
const DataTable = <TData, TValue>({
	columns,
	data,
	onRowPress,
	estimatedItemSize = 45,
	ListEmptyComponent,
	ListFooterComponent,
	isRefreshing = false,
	onRefresh,
	onEndReached,
	onEndReachedThreshold,
	renderItem,
	extraContext,
	tableMeta,
	TableFooterComponent,
	tableState,
	enableRowSelection,
	onRowSelectionChange,
	...props
}: DataTableProps<TData, TValue>) => {
	const [expandedRef, expanded$] = useObservableRef({} as ExpandedState);

	const insets = useSafeAreaInsets();
	const table = useReactTable({
		data,
		columns,
		getCoreRowModel: getCoreRowModel(),
		getRowId: (row: TData) => row.uuid,
		getExpandedRowModel: getExpandedRowModel(),
		onExpandedChange: (updater) => {
			const value = typeof updater === 'function' ? updater(expandedRef.current) : updater;
			expandedRef.current = value;
		},
		getRowCanExpand: (row) => row.original.type === 'variable',
		// debugTable: true,
		// manualExpanding: true,
		meta: {
			expanded$,
			expandedRef,
			onChange: (data: any) => {
				console.log('onChange called without handler', data);
			},
			...tableMeta,
		},
		state: {
			...tableState,
		},
		enableRowSelection: !!enableRowSelection,
		onRowSelectionChange: onRowSelectionChange ? onRowSelectionChange : undefined,
	});

	/**
	 *
	 */
	const defaultRenderRow = React.useCallback(
		({ item: row, index }: { item: Row<TData>; index: number }) => (
			<DataTableRow row={row} index={index} onRowPress={onRowPress} columns={columns} />
		),
		[onRowPress, columns]
	);

	/**
	 *
	 */
	const context = React.useMemo(() => ({ table, ...extraContext }), [table, extraContext]);

	/**
	 *
	 */
	return (
		<DataTableContext.Provider value={context}>
			{isRefreshing && (
				<Animated.View
					entering={FadeInUp}
					exiting={FadeOutUp}
					className="h-14 top-16 absolute items-center justify-center w-screen"
				>
					<ActivityIndicator size="small" className="text-foreground" />
				</Animated.View>
			)}
			<Table className="flex-1">
				<TableHeader>
					{table.getHeaderGroups().map((headerGroup) => (
						<TableRow key={headerGroup.id}>
							{headerGroup.headers.map((header) => {
								const meta = header.column.columnDef.meta;

								return (
									<TableHead
										key={header.id}
										className={cn(
											meta?.flex && `flex-${meta.flex}`,
											meta?.width && 'flex-none',
											meta?.align && getTailwindJustifyClass(meta.align)
										)}
										style={{ width: meta?.width ? meta.width : undefined }}
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
					<FlashList
						data={table.getRowModel().rows}
						estimatedItemSize={estimatedItemSize}
						ListEmptyComponent={ListEmptyComponent}
						ListFooterComponent={ListFooterComponent}
						showsVerticalScrollIndicator={false}
						contentContainerStyle={{
							paddingBottom: insets.bottom,
						}}
						refreshControl={
							<RefreshControl
								refreshing={isRefreshing}
								onRefresh={onRefresh}
								style={{ opacity: 0 }}
							/>
						}
						renderItem={renderItem || defaultRenderRow}
						onEndReached={onEndReached}
						onEndReachedThreshold={onEndReachedThreshold}
						keyExtractor={(row) => row.original.uuid}
						{...props}
					/>
				</TableBody>
			</Table>
			{TableFooterComponent && <TableFooterComponent />}
		</DataTableContext.Provider>
	);
};

export { DataTable, DataTableRow, useDataTable };
export type { DataTableProps };