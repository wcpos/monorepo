import * as React from 'react';

import { flexRender } from '@tanstack/react-table';
import { useObservableSuspense } from 'observable-hooks';

import type { ProductDocument } from '@wcpos/database';
import { ErrorBoundary } from '@wcpos/tailwind/src/error-boundary';
import { cn, getTailwindJustifyClass } from '@wcpos/tailwind/src/lib/utils';
import { Suspense } from '@wcpos/tailwind/src/suspense';
import { TableRow, TableCell } from '@wcpos/tailwind/src/table';
import { VStack } from '@wcpos/tailwind/src/vstack';

import { VariationTableFooter } from './footer';
import { TextCell } from '../../../../components/text-cell';

import type { Row } from '@tanstack/react-table';

interface Props {
	query: any;
	row: Row<ProductDocument>;
}

const cellRenderer = (props) => {
	const Cell = props.table.options.meta.variationRenderCell(props);

	if (Cell) {
		return (
			<ErrorBoundary>
				<Suspense>
					<Cell {...props} />
				</Suspense>
			</ErrorBoundary>
		);
	}

	return <TextCell {...props} />;
};

/**
 *
 */
export const VariationsTable = ({ query, row }: Props) => {
	const result = useObservableSuspense(query.resource);

	return (
		<VStack className="gap-0">
			{result.hits.map(({ id, document }, index) => {
				return (
					<TableRow
						key={id}
						className={cn('active:opacity-70', index % 2 && 'bg-zinc-100/50 dark:bg-zinc-900/50')}
					>
						{row.getVisibleCells().map((cell) => {
							const meta = cell.column.columnDef.meta;

							/**
							 * Create a context for the subrow using the parent's cell definitions
							 * - https://tanstack.com/table/latest/docs/guide/rows#sub-rows
							 */
							const subrowCellContext = {
								...cell.getContext(),
								row: {
									...row,
									parentId: row.id,
									getParentRow: () => row.original,
									original: document,
								},
							};

							return (
								<TableCell
									key={cell.id}
									className={cn(
										meta?.flex && `flex-${meta.flex}`,
										meta?.width && 'flex-none',
										meta?.align && getTailwindJustifyClass(meta.align),
										cell.column.id === 'image' && 'relative'
									)}
									style={{ width: meta?.width ? meta.width : undefined }}
								>
									{flexRender(cellRenderer, subrowCellContext)}
								</TableCell>
							);
						})}
					</TableRow>
				);
			})}
			<VariationTableFooter query={query} parent={row.original} count={result.hits.length} />
		</VStack>
	);
};
