import * as React from 'react';
import { ActivityIndicator, Dimensions, RefreshControl, ScrollView } from 'react-native';

import { FlashList, type FlashListProps } from '@shopify/flash-list';
import {
	ColumnDef,
	SortingState,
	flexRender,
	getCoreRowModel,
	getSortedRowModel,
	useReactTable,
	Row,
} from '@tanstack/react-table';
import Animated, { FadeInUp, FadeOutUp } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DataTableRow } from './row';
import { Table, TableBody, TableHead, TableHeader, TableRow } from '../table2';

export interface DataTableProps<TData, TValue> {
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
}

/**
 * @docs https://tanstack.com/table
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
}: DataTableProps<TData, TValue>) => {
	const insets = useSafeAreaInsets();
	const [sorting, setSorting] = React.useState<SortingState>([]);
	const table = useReactTable({
		data,
		columns,
		getCoreRowModel: getCoreRowModel(),
		onSortingChange: setSorting,
		getSortedRowModel: getSortedRowModel(),
		state: {
			sorting,
		},
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
	return (
		<>
			{isRefreshing && (
				<Animated.View
					entering={FadeInUp}
					exiting={FadeOutUp}
					className="h-14 top-16 absolute items-center justify-center w-screen"
				>
					<ActivityIndicator size="small" className="text-foreground" />
				</Animated.View>
			)}
			<ScrollView>
				<Table>
					<TableHeader>
						{table.getHeaderGroups().map((headerGroup) => (
							<TableRow key={headerGroup.id}>
								{headerGroup.headers.map((header) => {
									return (
										<TableHead key={header.id}>
											{header.isPlaceholder
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
						/>
					</TableBody>
				</Table>
			</ScrollView>
		</>
	);
};

export { DataTable, DataTableRow };
