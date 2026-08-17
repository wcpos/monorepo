import * as React from 'react';

import { CellContext } from '@tanstack/react-table';
import isFinite from 'lodash/isFinite';

import { Text } from '@wcpos/components/text';
import { type EngineRecord, useRecordField } from '@wcpos/query';

import { useT } from '../../../../../contexts/translations';
import { useNumberFormat } from '../../../hooks/use-number-format';

type ProductDocument = import('@wcpos/database').ProductDocument;
type ProductVariationDocument = import('@wcpos/database').ProductVariationDocument;
type Props = CellContext<
	{
		document: ProductDocument | ProductVariationDocument;
		record: EngineRecord<'products'> | EngineRecord<'variations'>;
	},
	string
> & {
	className?: string;
	withText?: boolean;
};

/**
 *
 */
export function StockQuantity({ row, className, withText = false }: Props) {
	const stockQuantity = useRecordField(
		row.original.record,
		(product) => product.payload.stock_quantity
	);
	const manageStock = useRecordField(
		row.original.record,
		(product) => product.payload.manage_stock
	);
	const { format } = useNumberFormat();
	const t = useT();

	/**
	 * Early exit
	 */
	if (!manageStock || !isFinite(stockQuantity)) {
		return null;
	}

	if (withText) {
		return (
			<Text className={className}>
				{t('pos_products.in_stock', { quantity: format(stockQuantity) })}
			</Text>
		);
	}

	return manageStock && isFinite(stockQuantity) ? (
		<Text className={className}>{format(stockQuantity)}</Text>
	) : null;
}
