import * as React from 'react';
import { Pressable, type PressableProps, View } from 'react-native';

import { flexRender, type RowData } from '@tanstack/react-table';

import { usePointer } from '@wcpos/components/lib/device';
import { ErrorBoundary } from '@wcpos/components/error-boundary';
import { Suspense } from '@wcpos/components/suspense';
import { TableCell } from '@wcpos/components/table';

import { getColumnStyle } from '../index';

import type { Row } from '../../../../../table-types';
import type { DataTableFeatures } from './index';

export function getRowTestID(item: { id: string; original: unknown }) {
	const record = (item.original as { record?: { payload?: { slug?: string }; uuid?: string } })
		.record;
	// Woo numeric ids can appear after a create ack; the adapter uuid/hit id is stable for the row.
	const stableId = record?.payload?.slug ?? record?.uuid ?? item.id;
	return stableId !== null && stableId !== undefined && stableId !== ''
		? `data-table-row-${stableId}`
		: undefined;
}

export function DataTableRow<TData extends RowData>({
	item,
	onPress,
	testID,
	trailing,
}: {
	item: Row<TData, DataTableFeatures>;
	onPress?: PressableProps['onPress'];
	testID?: string;
	trailing?: React.ReactNode;
}) {
	const pointer = usePointer();
	const cells = item.getVisibleCells();
	const content = (cell: (typeof cells)[number]) => (
		<ErrorBoundary key={cell.id}>
			<Suspense>
				{cell.column.id === 'actions' && trailing !== undefined
					? trailing
					: flexRender(cell.column.columnDef.cell, cell.getContext())}
			</Suspense>
		</ErrorBoundary>
	);
	const primary = cells.filter((cell) => !['price', 'actions'].includes(cell.column.id));
	const hasActions = cells.some((cell) => cell.column.id === 'actions');
	return (
		<View className="border-border border-b">
			<Pressable
				testID={testID ?? getRowTestID(item)}
				onPress={onPress}
				accessibilityRole={onPress ? 'button' : undefined}
				className={
					pointer === 'fine'
						? 'min-h-row active:bg-muted web:hover:bg-muted flex-row items-center'
						: 'min-h-row active:bg-muted flex-row items-center gap-3 px-3'
				}
			>
				{pointer === 'fine' ? (
					cells.map((cell, index) => (
						<TableCell
							key={cell.id}
							style={getColumnStyle(
								index === cells.length - 1
									? { ...cell.column.columnDef.meta, width: undefined, flex: 1 }
									: cell.column.columnDef.meta
							)}
						>
							{content(cell)}
						</TableCell>
					))
				) : (
					<>
						<View className="min-w-0 flex-1">{primary.map(content)}</View>
						{cells.filter((cell) => ['price', 'actions'].includes(cell.column.id)).map(content)}
					</>
				)}
				{!hasActions && trailing}
			</Pressable>
		</View>
	);
}
