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
import { resolveVariationStock } from '../../../../pos/products/cells/variations-popover/variation-stock';
import { TextCell } from '../../../../components/text-cell';
import { getColumnStyle } from '../../../data-table';

import type { CellContext, Row } from '@tanstack/react-table';

type ProductVariationDocument = import('@wcpos/database').ProductVariationDocument;

interface Props {
	binding: ReturnType<typeof import('../../../../../../query').useCollectionBinding<'variations'>>;
	row: Row<{ document: ProductDocument }>;
	hideOutOfStock?: boolean;
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
export function VariationsTable({ binding, row, hideOutOfStock }: Props) {
	const result = useObservableSuspense(binding.resource) as { hits: VariationHit[] };
	const hits = React.useMemo(
		() =>
			hideOutOfStock
				? result.hits.filter((hit) => resolveVariationStock(hit.document).sellable)
				: result.hits,
		[hideOutOfStock, result.hits]
	);

	/**
	 * @NOTE - Don't use a unique key here, index is sufficient
	 * https://shopify.github.io/flash-list/docs/fundamentals/performant-components#remove-key-prop
	 */
	return (
		<VStack className="gap-0">
			{hits.map((hit: VariationHit, index: number) => {
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
											getParentRow: () => row,
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
			<VariationTableFooter binding={binding} parent={row.original.document} count={hits.length} />
		</VStack>
	);
}
