import * as React from 'react';

import { useObservableState } from 'observable-hooks';

import NumberInput from '../../../components/number-input';

interface Props {
	item: import('@wcpos/database').LineItemDocument;
}

/**
 * The price is not actually the price, because the WC REST API is a piece of shit
 * - price as returned by REST API is total / quantity which is counter intuitive
 * - to give users a price field we need to do some gymnastics - subtotal / quantity
 */
export const Price = ({ item }: Props) => {
	const subtotal = useObservableState(item.subtotal$, item.subtotal);
	const total = useObservableState(item.total$, item.total);
	const quantity = item.getLatest().quantity;
	const price = parseFloat(subtotal) / quantity;
	const onSale = parseFloat(subtotal) !== parseFloat(total);

	/**
	 * update subtotal, not price
	 */
	const handleUpdate = React.useCallback(
		(newValue: string) => {
			const quantity = item.getLatest().quantity;
			const newSubtotal = String(quantity * parseFloat(newValue));
			item.incrementalPatch({ subtotal: newSubtotal, total: onSale ? total : newSubtotal });
		},
		[item, onSale, total]
	);

	/**
	 *
	 */
	return <NumberInput value={String(price)} onChange={handleUpdate} showDecimals />;
};
