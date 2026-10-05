import * as React from 'react';
import { View } from 'react-native';

import { usePointer } from '@wcpos/components/lib/device';
import { Skeleton, SKELETON_MAX_ROWS, skeletonCount } from '@wcpos/components/skeleton';
import { Table, TableCell, TableHead, TableHeader, TableRow } from '@wcpos/components/table';
import { Text } from '@wcpos/components/text';
import { useDocField } from '@wcpos/query';

import { UISettingID, useUISettings } from '../../../contexts/ui-settings';
import { DataTableHeader } from '../header';
import { getColumnStyle } from '../index';
import { TableSurface } from '../surface';

type Column = { key: string; hideLabel?: boolean; show?: boolean };

/**
 * The table lays its columns out by one rule in the header and the rows: configured
 * widths, with the last column taking the remainder unless an actions column trails it.
 * The skeleton follows the same rule so its columns sit where the real ones will.
 */
function columnStyle(columns: Column[], index: number) {
	const last = index === columns.length - 1 && !columns.some((column) => column.key === 'actions');
	return getColumnStyle(last ? { ...columns[index], width: undefined, flex: 1 } : columns[index]);
}

/**
 * Skeleton rows in the real row's own cells, so the rows that replace them are the same
 * size: an image column holds an image-sized block (it is what sets a product row's
 * height), every other column a line of text.
 */
export function DataTableSkeletonRows({ id, rowCount }: { id: UISettingID; rowCount: number }) {
	const { uiSettings } = useUISettings(id);
	const columns: Column[] = useDocField(uiSettings, (value) => value.columns).filter(
		(column: Column) => column.show
	);
	const pointer = usePointer();
	const count = Math.min(SKELETON_MAX_ROWS, Math.max(1, rowCount));
	return (
		<>
			{Array.from({ length: count }, (_, row) => (
				<View key={row} className="border-border flex-row items-center border-b">
					<View
						className={
							pointer === 'fine'
								? 'min-h-row flex-1 flex-row items-center'
								: 'min-h-row flex-1 flex-row items-center gap-3 px-3'
						}
					>
						{columns.map((column, index) => (
							<TableCell key={column.key} style={columnStyle(columns, index)}>
								{column.key === 'image' ? (
									<View className="w-full pl-3">
										<Skeleton
											className="h-20 w-full flex-none rounded"
											testID={`data-table-skeleton-${column.key}`}
										/>
									</View>
								) : (
									<Skeleton
										shape="line"
										className="w-3/4"
										testID={`data-table-skeleton-${column.key}`}
									/>
								)}
							</TableCell>
						))}
					</View>
				</View>
			))}
		</>
	);
}

/**
 * The table's own frame around skeleton rows: the header it will have, a body that clips,
 * and the footer line pinned where the footer will be. A table that loads into this frame
 * changes its contents and nothing else.
 */
export function DataTableSkeleton({ id, rowCount }: { id: UISettingID; rowCount?: number }) {
	const { uiSettings, getUILabel } = useUISettings(id);
	const columns: Column[] = useDocField(uiSettings, (value) => value.columns).filter(
		(column: Column) => column.show
	);
	const pointer = usePointer();
	const [height, setHeight] = React.useState(0);
	return (
		// The same card the loaded table stands on, with the footer's row held beneath it, so the
		// shell and the table share one frame.
		<View className="flex h-full flex-col">
			<TableSurface>
				<Table className="flex h-full flex-col">
					{pointer === 'fine' && (
						<TableHeader>
							<TableRow className="min-h-row border-border border-b">
								{columns.map((column, index) => (
									<TableHead
										key={column.key}
										className="min-h-row relative"
										style={columnStyle(columns, index)}
									>
										<DataTableHeader
											columnId={column.key}
											header={
												<Text className="text-muted-foreground text-xs tracking-wide uppercase">
													{column.hideLabel ? '' : getUILabel(column.key)}
												</Text>
											}
											disableSort
											sortBy=""
											sortDirection="asc"
											onSortingChange={() => {}}
										/>
									</TableHead>
								))}
							</TableRow>
						</TableHeader>
					)}
					<View
						className="flex-1 overflow-hidden"
						onLayout={(event) => setHeight(event.nativeEvent.layout.height)}
					>
						<DataTableSkeletonRows id={id} rowCount={rowCount ?? skeletonCount(height, 48)} />
					</View>
				</Table>
			</TableSurface>
			<View className="min-h-ctl" />
		</View>
	);
}
