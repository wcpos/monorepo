import * as React from 'react';

import { Text } from '@wcpos/components/text';
import { type EngineRecord, useRecordField } from '@wcpos/query';

import type { CellContext } from '@tanstack/react-table';

type ProductDocument = import('@wcpos/database').ProductDocument;

/**
 *
 */
export function SKU({
	row,
}: CellContext<{ document: ProductDocument; record: EngineRecord<'products'> }, 'sku'>) {
	const sku = useRecordField(row.original.record, (product) => product.payload.sku);

	return <Text>{sku}</Text>;
}
