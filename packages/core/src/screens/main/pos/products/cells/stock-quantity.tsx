import * as React from 'react';

import { CellContext } from '@tanstack/react-table';
import isFinite from 'lodash/isFinite';
import { useObservableEagerState } from 'observable-hooks';

import { Text } from '@wcpos/components/src/text';

import { useT } from '../../../../../contexts/translations';
import { useNumberFormat } from '../../../hooks/use-number-format';

type ProductDocument = import('@wcpos/database').ProductDocument;
type ProductVariationDocument = import('@wcpos/database').ProductVariationDocument;
type Props = CellContext<{ document: ProductDocument | ProductVariationDocument }, string> & {
	className?: string;
	withText?: boolean;
};

/**
 *
 */
export const StockQuantity = ({ row, className, withText = false }: Props) => {
	const product = row.original.document;
	const stockQuantity = useObservableEagerState(product.stock_quantity$);
	const manageStock = useObservableEagerState(product.manage_stock$);
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
				{t('{quantity} in stock', { quantity: format(stockQuantity), _tags: 'core' })}
			</Text>
		);
	}

	return manageStock && isFinite(stockQuantity) ? (
		<Text className={className}>{format(stockQuantity)}</Text>
	) : null;
};
