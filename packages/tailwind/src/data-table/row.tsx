import * as React from 'react';

import { flexRender, Row } from '@tanstack/react-table';

import { cn, getTailwindJustifyClass } from '../lib/utils';
import { TableRow, TableCell } from '../table2';

interface Props<TData> {
	row: Row<TData>;
	index: number;
	className?: string;
}

/**
 * @TODO - it might be good to have a local state for visibility of columns to make the UI more responsive
 */
export const DataTableRow = <TData,>({ row, index, className }: Props<TData>) => {
	return (
		<TableRow index={index} className={className}>
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
