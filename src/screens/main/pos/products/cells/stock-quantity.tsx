import * as React from 'react';

import isFinite from 'lodash/isFinite';
import { useObservableEagerState } from 'observable-hooks';

import { Text } from '@wcpos/tailwind/src/text';

import { useAppState } from '../../../../../contexts/app-state';

type Props = {
	item: import('@wcpos/database').ProductDocument;
};

/**
 * @TODO - update the useCurrencyFormat hook to handle the decimal separator for quantity
 */
export const StockQuantity = ({ item: product }: Props) => {
	const stockQuantity = useObservableEagerState(product.stock_quantity$);
	const manageStock = useObservableEagerState(product.manage_stock$);
	const { store } = useAppState();
	const decimalSeparator = useObservableEagerState(store.price_decimal_sep$);
	const displayStockQuantity = String(stockQuantity).replace('.', decimalSeparator);

	return manageStock && isFinite(stockQuantity) ? <Text>{displayStockQuantity}</Text> : null;
};
