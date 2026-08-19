import * as React from 'react';

import { useDocField } from '@wcpos/query';
import type { CellContext } from '@wcpos/core/table-types';

import { CurrencyInput } from '../../../components/currency-input';
import { useUISettings } from '../../../contexts/ui-settings';
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
export function RegularPrice({ row }: CellContext<Props, 'regular_price'>) {
	const item = row.original.item;
	const uuid = row.original.uuid;
	const { updateLineItem } = useUpdateLineItem();
	const { getLineItemData } = useLineItemData();
	const { regular_price: value } = getLineItemData(item);

	/**
	 * Discounts
	 */
	const { uiSettings } = useUISettings('pos-cart');
	const quickDiscounts = useDocField(uiSettings, (settings) => settings.quickDiscounts);

	/**
	 *
	 */
	return (
		<CurrencyInput
			value={value}
			onChangeText={(regular_price) => updateLineItem(uuid, { regular_price })}
			discounts={ensureNumberArray(quickDiscounts)}
		/>
	);
}
