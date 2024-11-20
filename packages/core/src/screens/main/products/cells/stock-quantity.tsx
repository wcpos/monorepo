import * as React from 'react';
import { View } from 'react-native';

import { useObservableEagerState } from 'observable-hooks';

import { SwitchWithLabel } from '@wcpos/components/src/switch';
import { VStack } from '@wcpos/components/src/vstack';

import { useT } from '../../../../contexts/translations';
import { NumberInput } from '../../components/number-input';

import type { CellContext } from '@tanstack/react-table';

type ProductDocument = import('@wcpos/database').ProductDocument;

/**
 *
 */
export const StockQuantity = ({
	row,
	table,
}: CellContext<{ document: ProductDocument }, 'stock_quantity'>) => {
	const product = row.original.document;
	const stockQuantity = useObservableEagerState(product.stock_quantity$);
	const manageStock = useObservableEagerState(product.manage_stock$);
	const t = useT();

	return (
		<VStack>
			<View className="flex-row justify-center">
				<NumberInput
					value={String(stockQuantity || 0)}
					onChangeText={(stock_quantity) =>
						table.options.meta.onChange({ document: product, changes: { stock_quantity } })
					}
					disabled={!manageStock}
				/>
			</View>
			<SwitchWithLabel
				nativeID="manage_stock"
				label={t('Manage', { _tags: 'core' })}
				checked={manageStock}
				onCheckedChange={(manage_stock) =>
					table.options.meta.onChange({ document: product, changes: { manage_stock } })
				}
				size="sm"
			/>
		</VStack>
	);
};
