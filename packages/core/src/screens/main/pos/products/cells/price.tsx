import * as React from 'react';

import { VStack } from '@wcpos/components/vstack';
import { type EngineRecord, useRecordField } from '@wcpos/query';

import { PriceWithTax } from '../../../components/product/price-with-tax';

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
	const regular_price = useRecordField(
		row.original.record,
		(product) => product.payload.regular_price
	);
	const taxStatus = useRecordField(row.original.record, (product) => product.payload.tax_status);
	const taxClass = useRecordField(row.original.record, (product) => product.payload.tax_class);
	const onSale = useRecordField(row.original.record, (product) => product.payload.on_sale);

	const meta = column.columnDef.meta;
	const show = meta?.show ?? (() => false);
	const showRegularPrice = show('on_sale') && onSale;

	/**
	 *
	 */
	const taxDisplay = show('tax') ? ('text' as const) : ('tooltip' as const);
	const safeTaxStatus = (taxStatus || 'none') as 'taxable' | 'shipping' | 'none';

	return showRegularPrice ? (
		<VStack space="xs" className="justify-end">
			<PriceWithTax
				price={regular_price ?? ''}
				taxStatus={safeTaxStatus}
				taxClass={taxClass ?? ''}
				taxDisplay={taxDisplay}
				strikethrough
			/>
			<PriceWithTax
				price={price ?? ''}
				taxStatus={safeTaxStatus}
				taxClass={taxClass ?? ''}
				taxDisplay={taxDisplay}
			/>
		</VStack>
	) : (
		<PriceWithTax
			price={price ?? ''}
			taxStatus={safeTaxStatus}
			taxClass={taxClass ?? ''}
			taxDisplay={taxDisplay}
		/>
	);
}
