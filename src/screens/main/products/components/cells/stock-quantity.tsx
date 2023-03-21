import * as React from 'react';

import { useObservableState } from 'observable-hooks';

import Box from '@wcpos/components/src/box';
import Checkbox from '@wcpos/components/src/checkbox';

import { t } from '../../../../../lib/translations';
import NumberInput from '../../../components/number-input';

type ProductDocument = import('@wcpos/database').ProductDocument;

type Props = {
	item: ProductDocument;
	onChange: (product: ProductDocument, data: Record<string, unknown>) => void;
};

/**
 *
 */
const StockQuantity = ({ item: product, onChange }: Props) => {
	// const stockQuantity = useObservableState(product.stock_quantity$, product.stock_quantity);
	// const manageStock = useObservableState(product.manage_stock$, product.manage_stock);
	const stockQuantity = product.stock_quantity || 0;
	const manageStock = product.manage_stock;

	return (
		<Box space="small">
			<NumberInput
				value={String(stockQuantity)}
				onChange={(stock_quantity) => onChange(product, { stock_quantity })}
				disabled={!manageStock}
			/>
			<Checkbox
				label={t('Manage', { _tags: 'core' })}
				value={manageStock}
				onChange={(manage_stock) => onChange(product, { manage_stock })}
				type="secondary"
				size="small"
			/>
		</Box>
	);
};

export default StockQuantity;
