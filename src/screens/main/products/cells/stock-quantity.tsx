import * as React from 'react';

import { useObservableEagerState, useObservableState } from 'observable-hooks';

import { CellContext } from '@wcpos/tailwind/src/data-table';
import { SwitchWithLabel } from '@wcpos/tailwind/src/switch';
import { VStack } from '@wcpos/tailwind/src/vstack';

import { useT } from '../../../../contexts/translations';
import NumberInput from '../../components/number-input';

type ProductDocument = import('@wcpos/database').ProductDocument;

/**
 *
 */
export const StockQuantity = ({ row }: CellContext<ProductDocument, 'stock_quantity'>) => {
	const product = row.original;
	const stockQuantity = useObservableEagerState(product.stock_quantity$);
	const manageStock = useObservableEagerState(product.manage_stock$);
	const t = useT();

	return (
		<VStack>
			<NumberInput
				value={String(stockQuantity || 0)}
				onChange={(stock_quantity) => onChange(product, { stock_quantity })}
				disabled={!manageStock}
			/>
			<SwitchWithLabel
				nativeID="manage_stock"
				label={t('Manage', { _tags: 'core' })}
				checked={manageStock}
				onCheckedChange={(manage_stock) => onChange(product, { manage_stock })}
				size="xs"
			/>
		</VStack>
	);
};
