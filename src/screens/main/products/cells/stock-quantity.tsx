import * as React from 'react';

import { useObservableState } from 'observable-hooks';

import { SwitchWithLabel } from '@wcpos/tailwind/src/switch';
import { VStack } from '@wcpos/tailwind/src/vstack';

import { useT } from '../../../../contexts/translations';
import NumberInput from '../../components/number-input';

type ProductDocument = import('@wcpos/database').ProductDocument;

type Props = {
	item: ProductDocument;
	onChange: (product: ProductDocument, data: Record<string, unknown>) => void;
};

/**
 *
 */
const StockQuantity = ({ item: product, onChange }: Props) => {
	const stockQuantity = useObservableState(product.stock_quantity$, product.stock_quantity);
	const manageStock = useObservableState(product.manage_stock$, product.manage_stock);
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

export default StockQuantity;
