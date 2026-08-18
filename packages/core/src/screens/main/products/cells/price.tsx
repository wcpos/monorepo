import * as React from 'react';

import { type EngineRecord, useRecordField } from '@wcpos/query';

import { PriceWithTax } from '../../components/product/price-with-tax';

import type { CellContext } from '@tanstack/react-table';

type ProductDocument = import('@wcpos/database').ProductDocument;

/**
 *
 */
export function Price({
	row,
	column,
}: CellContext<{ document: ProductDocument; record: EngineRecord<'products'> }, 'price'>) {
	const price = useRecordField(row.original.record, (product) => product.payload.price);
	const taxStatus = useRecordField(row.original.record, (product) => product.payload.tax_status);
	const taxClass = useRecordField(row.original.record, (product) => product.payload.tax_class);

	/**
	 *
	 */
	return (
		<PriceWithTax
			price={price ?? ''}
			taxStatus={taxStatus === '' || taxStatus === undefined ? 'none' : taxStatus}
			taxClass={taxClass ?? ''}
			taxDisplay={column.columnDef.meta?.show?.('tax') ? 'text' : 'tooltip'}
		/>
	);
}
