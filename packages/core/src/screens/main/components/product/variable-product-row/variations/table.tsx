import * as React from 'react';

import { flexRender } from '@tanstack/react-table';
import { useObservableSuspense } from 'observable-hooks';

import { ErrorBoundary } from '@wcpos/components/src/error-boundary';
import { cn, getFlexAlign } from '@wcpos/components/src/lib/utils';
import { Suspense } from '@wcpos/components/src/suspense';
import { TableRow, TableCell } from '@wcpos/components/src/table';
import { VStack } from '@wcpos/components/src/vstack';
import type { ProductDocument } from '@wcpos/database';

import { VariationTableFooter } from './footer';
import { TextCell } from '../../../../components/text-cell';

import type { Row } from '@tanstack/react-table';

interface Props {
	query: any;
	row: Row<{ document: ProductDocument }>;
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

	/**
	 * @NOTE - Don't use a unique key here, index is sufficient
	 * https://shopify.github.io/flash-list/docs/fundamentals/performant-components#remove-key-prop
	 */
	return (
		<VStack className="gap-0">
			{result.hits.map((hit, index) => {
				return (
					<TableRow key={index} index={index}>
						{row.getVisibleCells().map((cell, index) => {
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
									original: hit,
								},
							};

							return (
								<TableCell
									key={index}
									className={cn(cell.column.id === 'image' && 'relative')}
									style={{
										flexGrow: meta?.width ? 0 : meta?.flex ? meta.flex : 1,
										flexBasis: meta?.width ? meta.width : undefined,
										alignItems: getFlexAlign(meta?.align || 'left'),
									}}
								>
									{flexRender(cellRenderer, subrowCellContext)}
								</TableCell>
							);
						})}
					</TableRow>
				);
			})}
			<VariationTableFooter
				query={query}
				parent={row.original.document}
				count={result.hits.length}
			/>
		</VStack>
	);
};
