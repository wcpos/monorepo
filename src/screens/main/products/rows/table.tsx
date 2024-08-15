import * as React from 'react';

import { flexRender } from '@tanstack/react-table';
import { useObservableSuspense } from 'observable-hooks';

import type { ProductDocument } from '@wcpos/database';
import type { Row } from '@wcpos/tailwind/src/data-table';
import { ErrorBoundary } from '@wcpos/tailwind/src/error-boundary';
import { HStack } from '@wcpos/tailwind/src/hstack';
import { cn, getTailwindJustifyClass } from '@wcpos/tailwind/src/lib/utils';
import { Suspense } from '@wcpos/tailwind/src/suspense';
import { TableRow, TableCell } from '@wcpos/tailwind/src/table2';
import { VStack } from '@wcpos/tailwind/src/vstack';

import { Date } from '../../components/date';
import { ProductVariationImage } from '../../components/product/variation-image';
import { TextCell } from '../../components/text-cell';
import { Barcode } from '../cells/barcode';
import { EdittablePrice } from '../cells/edittable-price';
import { StockQuantity } from '../cells/stock-quantity';
import { StockStatus } from '../cells/stock-status';
import { VariationActions } from '../cells/variation-actions';

interface Props {
	query: any;
	row: Row<ProductDocument>;
}

const cells = {
	actions: VariationActions,
	price: EdittablePrice,
	sale_price: EdittablePrice,
	regular_price: EdittablePrice,
	stock_quantity: StockQuantity,
	date_created: Date,
	date_modified: Date,
	barcode: Barcode,
	stock_status: StockStatus,
	image: ProductVariationImage,
	categories: () => {},
	tags: () => {},
};

const cellRenderer = (props) => {
	const Cell = cells[props.column.id];

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

							// Create a context for the subrow using the parent's cell definitions
							const subrowCellContext = {
								...cell.getContext(),
								row: {
									...row,
									parent: row.original,
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
			<HStack className="p-2 bg-input"></HStack>
		</VStack>
	);
};
