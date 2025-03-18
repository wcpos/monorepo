import * as React from 'react';
import { ActivityIndicator, RefreshControl, LayoutChangeEvent } from 'react-native';

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
import { useFocusEffect } from 'expo-router';
import { useObservableRef } from 'observable-hooks';
import Animated, {
	useSharedValue,
	useAnimatedStyle,
	FadeInUp,
	FadeOutUp,
} from 'react-native-reanimated';
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
	});

	/**
	 *
	 */
	const handleRenderRow = React.useCallback(
		({ item: row, index }: { item: Row<TData>; index: number }) =>
			renderItem ? renderItem({ item: row, index }) : <DataTableRow row={row} index={index} />,
		[renderItem]
	);

	/**
	 *
	 */
	const context = React.useMemo(() => ({ table, ...extraContext }), [table, extraContext]);

	/**
	 * @FIXME - This is a hack!!
	 * If the columns change, FlashList will not re-render the list.
	 * We can force a re-render by changing the extraData.
	 *
	 * @TODO - look at context and extraData and see if we can make this more efficient.
	 * It would be better to get react-table to trigger the re-render in the row component.
	 */
	const extraDataWithTimestamp = React.useMemo(
		() => ({ ...(extraData || {}), timestamp: Date.now() }),
		[
			extraData,
			// force re-render if columns change
			columns,
		]
	);

	/**
	 * FlashList wants to know the size of it's container, so we need to calculate it.
	 *
	 * NOTE! we also need to allow size to change when column or page  is resized.
	 */
	const width = useSharedValue(0);
	const height = useSharedValue(0);
	const animatedStyle = useAnimatedStyle(() => {
		return {
			width: width.value !== 0 ? width.value : undefined,
			height: height.value !== 0 ? height.value : undefined,
		};
	});

	/**
	 *
	 */
	const onLayout = React.useCallback(
		({ nativeEvent }: LayoutChangeEvent) => {
			if (nativeEvent.layout.width !== 0 && nativeEvent.layout.height !== 0) {
				width.value = nativeEvent.layout.width;
				height.value = nativeEvent.layout.height;
			}
		},
		[height, width]
	);

	/**
	 * https://github.com/Shopify/flash-list/issues/609
	 */
	const [isFocused, setIsFocused] = React.useState(false);
	useFocusEffect(
		React.useCallback(() => {
			setIsFocused(true);
			return () => setIsFocused(false);
		}, [])
	);

	/**
	 *
	 */
	return (
		<DataTableContext.Provider value={context}>
			{/* {isRefreshing && (
				<Animated.View
					entering={FadeInUp}
					exiting={FadeOutUp}
					className="h-14 top-16 absolute items-center justify-center w-screen"
				>
					<ActivityIndicator size="small" className="text-foreground" />
				</Animated.View>
			)} */}
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
				<TableBody onLayout={onLayout}>
					<Animated.View style={[animatedStyle, { flex: 1 }]}>
						{isFocused && (
							<FlashList
								data={table.getRowModel().rows}
								estimatedItemSize={estimatedItemSize}
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
								renderItem={handleRenderRow}
								keyExtractor={(row) => row.id}
								extraData={extraDataWithTimestamp}
								onEndReached={() => {
									if (isFocused && typeof onEndReached === 'function') {
										onEndReached();
									}
								}}
								{...props}
							/>
						)}
					</Animated.View>
				</TableBody>
			</Table>
			{TableFooterComponent && <TableFooterComponent />}
		</DataTableContext.Provider>
	);
};

export { DataTable, DataTableRow, useDataTable };
export type { DataTableProps };
