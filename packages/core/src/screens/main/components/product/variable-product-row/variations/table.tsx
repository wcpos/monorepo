import * as React from 'react';

import { flexRender } from '@tanstack/react-table';
import { useObservableSuspense } from 'observable-hooks';

import { ErrorBoundary } from '@wcpos/components/error-boundary';
import { cn } from '@wcpos/components/lib/utils';
import { Suspense } from '@wcpos/components/suspense';
import { TableCell, TableRow } from '@wcpos/components/table';
import { VStack } from '@wcpos/components/vstack';
import type { ProductDocument } from '@wcpos/database';

import { VariationTableFooter } from './footer';
import { TextCell } from '../../../../components/text-cell';
import { getColumnStyle } from '../../../data-table';

import type { CellContext, Row } from '@tanstack/react-table';

type ProductVariationDocument = import('@wcpos/database').ProductVariationDocument;

interface Props {
	query: import('@wcpos/query').Query<import('@wcpos/database').ProductVariationCollection>;
	row: Row<{ document: ProductDocument }>;
}

interface VariationHit {
	id: string;
	document: ProductVariationDocument;
}

const cellRenderer = (props: CellContext<Record<string, unknown>, unknown>) => {
	const meta = props.table.options.meta as
		| {
				variationRenderCell?: (
					props: CellContext<Record<string, unknown>, unknown>
				) => React.ComponentType<CellContext<Record<string, unknown>, unknown>> | null;
		  }
		| undefined;
	const Cell = meta?.variationRenderCell?.(props);

	if (Cell) {
		return (
			<ErrorBoundary>
				<Suspense>
					<Cell {...props} />
				</Suspense>
			</ErrorBoundary>
		);
	}

	return <TextCell {...(props as CellContext<Record<string, unknown>, string>)} />;
};

/**
 *
 */
export const VariationsTable = ({ query, row }: Props) => {
	const result = useObservableSuspense(query.resource) as { hits: VariationHit[] };

	/**
	 * @NOTE - Don't use a unique key here, index is sufficient
	 * https://shopify.github.io/flash-list/docs/fundamentals/performant-components#remove-key-prop
	 */
	return (
		<VStack className="gap-0">
			{result.hits.map((hit: VariationHit, index: number) => {
				return (
					<TableRow key={index} index={index}>
						{row
							.getVisibleCells()
							.map(
								(
									cell: import('@tanstack/react-table').Cell<
										{ document: ProductDocument },
										unknown
									>,
									cellIndex: number
								) => {
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
											key={cellIndex}
											className={cn(cell.column.id === 'image' && 'relative')}
											style={getColumnStyle(cell.column.columnDef.meta)}
										>
											{flexRender(
												cellRenderer,
												subrowCellContext as unknown as CellContext<
													Record<string, unknown>,
													unknown
												>
											)}
										</TableCell>
									);
								}
							)}
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
