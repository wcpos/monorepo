import * as React from 'react';
import { View } from 'react-native';

import { useObservableEagerState } from 'observable-hooks';

import { SwitchWithLabel } from '@wcpos/components/switch';
import { VStack } from '@wcpos/components/vstack';

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
	const stockQuantity = useObservableEagerState(product.stock_quantity$!);
	const manageStock = useObservableEagerState(product.manage_stock$!);
	const t = useT();
	const meta = table.options.meta as unknown as {
		onChange: (arg: { document: ProductDocument; changes: Record<string, unknown> }) => void;
	};

	return (
		<VStack>
			<View className="flex-row justify-center">
				<NumberInput
					value={String(stockQuantity || 0)}
					onChangeText={(stock_quantity) =>
						meta.onChange({ document: product, changes: { stock_quantity } })
					}
					disabled={!manageStock}
				/>
			</View>
			<SwitchWithLabel
				nativeID="manage_stock"
				label={t('products.manage')}
				checked={manageStock ?? false}
				onCheckedChange={(manage_stock) =>
					meta.onChange({ document: product, changes: { manage_stock } })
				}
				size="sm"
			/>
		</VStack>
	);
};
