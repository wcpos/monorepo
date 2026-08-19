import * as React from 'react';

import { Text } from '@wcpos/components/text';
import { VStack } from '@wcpos/components/vstack';
import { useDocField } from '@wcpos/query';
import type { CellContext } from '@wcpos/core/table-types';

import { CurrencyInput } from '../../../components/currency-input';
import { useUISettings } from '../../../contexts/ui-settings';
import { useCurrencyFormat } from '../../../hooks/use-currency-format';
import { useLineItemData } from '../../hooks/use-line-item-data';
import { useUpdateLineItem } from '../../hooks/use-update-line-item';
import { ensureNumberArray } from './ensure-number-array';

type LineItem = NonNullable<import('@wcpos/database').OrderDocument['line_items']>[number];
interface Props {
	uuid: string;
	item: LineItem;
	type: 'line_items';
}

/**
 *
 */
export function Price({ row, column }: CellContext<Props, 'price'>) {
	const { item, uuid } = row.original;
	const { updateLineItem } = useUpdateLineItem();
	const { getLineItemData } = useLineItemData();
	const { price, regular_price } = getLineItemData(item);
	const { format } = useCurrencyFormat();
	const isOnSale = price !== regular_price;

	/**
	 * Discounts
	 */
	const { uiSettings } = useUISettings('pos-cart');
	const quickDiscounts = useDocField(uiSettings, (settings) => settings.quickDiscounts);

	/**
	 *
	 */
	return (
		<VStack space="xs">
			{isOnSale && column.columnDef.meta?.show?.('on_sale') && (
				<Text className="text-muted-foreground text-right line-through">
					{format(regular_price || 0)}
				</Text>
			)}
			<CurrencyInput
				value={price}
				onChangeText={(price) => updateLineItem(uuid, { price })}
				discounts={ensureNumberArray(quickDiscounts)}
			/>
		</VStack>
	);
}
