import * as React from 'react';

import type { CellContext } from '@wcpos/core/table-types';
import { IconButton } from '@wcpos/components/icon-button';
import type { EngineRecord } from '@wcpos/query';

import { useAddProduct } from '../../hooks/use-add-product';
import { useT } from '../../../../../contexts/translations';

/**
 *
 */
export function Actions({ row }: CellContext<{ record: EngineRecord<'products'> }, 'actions'>) {
	const t = useT();
	const { addProduct } = useAddProduct();

	/**
	 *
	 */
	return (
		<IconButton
			testID="add-to-cart-button"
			name="plus"
			variant="success"
			accessibilityLabel={t('common.add_to_cart')}
			onPress={() => addProduct(row.original.record)}
		/>
	);
}
