import * as React from 'react';

import { flexRender, Row } from '@tanstack/react-table';

import { cn, getTailwindJustifyClass } from '../lib/utils';
import { TableRow, TableCell } from '../table2';

interface Props<TData> {
	row: Row<TData>;
	index: number;
	onRowPress?: (row: Row<TData>) => void;
}

/**
 * @TODO - it might be good to have a local state for visibility of columns to make the UI more responsive
 */
export const DataTableRow = <TData,>({ row, index, onRowPress }: Props<TData>) => {
	return (
		<TableRow
			className={cn('active:opacity-70', index % 2 && 'bg-zinc-100/50 dark:bg-zinc-900/50')}
			// onPress={
			// 	onRowPress
			// 		? () => {
			// 				onRowPress(row);
			// 			}
			// 		: undefined
			// }
		>
			{row.getVisibleCells().map((cell) => {
				const meta = cell.column.columnDef.meta;

				return (
					<TableCell
						key={cell.id}
						className={cn(
							meta?.flex && `flex-${meta.flex}`,
							meta?.width && 'flex-none',
							meta?.align && getTailwindJustifyClass(meta.align)
						)}
						style={{ width: meta?.width ? meta.width : undefined }}
					>
						{flexRender(cell.column.columnDef.cell, cell.getContext())}
					</TableCell>
				);
			})}
		</TableRow>
	);
};
