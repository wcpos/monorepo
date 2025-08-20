import * as React from 'react';

import { flexRender, Row } from '@tanstack/react-table';

import { cn, getFlexAlign } from '../lib/utils';
import { TableCell, TableRow } from '../table';

export type Renderable<TProps> = React.ReactNode | React.ComponentType<TProps>;

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
			{row.getVisibleCells().map((cell, index) => {
				const meta = cell.column.columnDef.meta;

				return (
					<TableCell
						/**
						 * @NOTE - Don't use a unique key here, index is sufficient
						 * https://shopify.github.io/flash-list/docs/fundamentals/performant-components#remove-key-prop
						 */
						key={index}
						style={{
							flexGrow: meta?.width ? 0 : meta?.flex ? meta.flex : 1,
							flexBasis: meta?.width ? meta.width : undefined,
							alignItems: getFlexAlign(meta?.align || 'left'),
						}}
					>
						{flexRender(cell.column.columnDef.cell, cell.getContext())}
					</TableCell>
				);
			})}
		</TableRow>
	);
};
