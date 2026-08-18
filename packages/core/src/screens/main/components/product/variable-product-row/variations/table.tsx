import * as React from 'react';

import { flexRender } from '@tanstack/react-table';
import { useObservableSuspense } from 'observable-hooks';

import { ErrorBoundary } from '@wcpos/components/error-boundary';
import { cn } from '@wcpos/components/lib/utils';
import { Suspense } from '@wcpos/components/suspense';
import { TableCell, TableRow } from '@wcpos/components/table';
import { VStack } from '@wcpos/components/vstack';
import type { ProductDocument } from '@wcpos/database';
import type { EngineRecord } from '@wcpos/query';

import { VariationTableFooter } from './footer';
import { resolveVariationStock } from '../../../../pos/products/cells/variations-popover/variation-stock';
import { TextCell } from '../../../../components/text-cell';
import { getColumnStyle } from '../../../data-table';

import type { DataTableFeatures } from '../../../data-table';
import type { Cell, CellContext, Row } from '../../../../../../table-types';

type ProductVariationDocument = import('@wcpos/database').ProductVariationDocument;

interface Props {
	binding: ReturnType<typeof import('../../../../../../query').useCollectionBinding<'variations'>>;
	row: Row<{ document: ProductDocument; record: EngineRecord<'products'> }, DataTableFeatures>;
	hideOutOfStock?: boolean;
}

interface TableCellRow {
	document: Record<string, unknown>;
}

interface VariationHit {
	id: string;
	document: ProductVariationDocument;
	record: EngineRecord<'variations'>;
}

const cellRenderer = (props: CellContext<TableCellRow, unknown, DataTableFeatures>) => {
	const meta = props.table.options.meta as
		| {
				variationRenderCell?: (
					props: CellContext<TableCellRow, unknown, DataTableFeatures>
				) => React.ComponentType<CellContext<TableCellRow, unknown, DataTableFeatures>> | null;
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

	return <TextCell {...(props as CellContext<TableCellRow, string, DataTableFeatures>)} />;
};

/**
 *
 */
export function VariationsTable({ binding, row, hideOutOfStock }: Props) {
	/**
	 * React Compiler breaks tanstack/react-table: it caches the
	 * row.getVisibleCells() JSX keyed on the stable Row object, so subrows keep
	 * rendering stale columns after a columnVisibility change.
	 * https://github.com/facebook/react/issues/33057
	 *
	 * eslint's react-compiler rule (19.1.0-rc.2) claims this directive is unused,
	 * but babel-plugin-react-compiler 1.0.0 (the app build) does memoize this
	 * component — see column-visibility.test.tsx, which compiles it for real.
	 */
	// eslint-disable-next-line react-compiler/react-compiler -- directive is load-bearing under babel-plugin-react-compiler 1.0.0
	'use no memo';
	const result = useObservableSuspense(binding.resource) as { hits: VariationHit[] };
	const hits = React.useMemo(
		() =>
			hideOutOfStock
				? result.hits.filter((hit) => resolveVariationStock(hit.record.payload).sellable)
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
									cell: Cell<
										{ document: ProductDocument; record: EngineRecord<'products'> },
										unknown,
										DataTableFeatures
									>,
									cellIndex: number
								) => {
									/**
									 * Create a context for the subrow using the parent's cell definitions
									 * - https://tanstack.com/table/latest/docs/guide/rows#sub-rows
									 */
									const subrowCellContext = {
										...cell.getContext(),
										row: Object.assign(Object.create(row), {
											parentId: row.id,
											getParentRow: () => row,
											original: hit,
										}),
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
													TableCellRow,
													unknown,
													DataTableFeatures
												>
											)}
										</TableCell>
									);
								}
							)}
					</TableRow>
				);
			})}
			<VariationTableFooter binding={binding} parent={row.original.record} count={hits.length} />
		</VStack>
	);
}
