import * as React from 'react';

import { flexRender, Row, ColumnDef } from '@tanstack/react-table';

import { cn } from '../lib/utils';
import { TableRow, TableCell } from '../table2';

interface Props<TData> {
	row: Row<TData>;
	index: number;
	onRowPress?: (row: Row<TData>) => void;
	columns: ColumnDef<TData, any>[];
}

/**
 *
 */
export const DataTableRow = <TData,>({ row, index, onRowPress, columns }: Props<TData>) => {
	return (
		<TableRow
			className={cn('active:opacity-70', index % 2 && 'bg-zinc-100/50 dark:bg-zinc-900/50')}
			onPress={
				onRowPress
					? () => {
							onRowPress(row);
						}
					: undefined
			}
		>
			{row.getVisibleCells().map((cell) => (
				<TableCell key={cell.id}>
					{flexRender(cell.column.columnDef.cell, cell.getContext())}
				</TableCell>
			))}
		</TableRow>
	);
};
