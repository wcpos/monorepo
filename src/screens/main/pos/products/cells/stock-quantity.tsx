import * as React from 'react';

import { CellContext } from '@tanstack/react-table';
import isFinite from 'lodash/isFinite';
import { useObservableEagerState } from 'observable-hooks';

import { Text } from '@wcpos/components/src/text';

import { useAppState } from '../../../../../contexts/app-state';

type ProductDocument = import('@wcpos/database').ProductDocument;
type Props = CellContext<ProductDocument, string> & { className?: string };

/**
 * @TODO - update the useCurrencyFormat hook to handle the decimal separator for quantity
 */
export const StockQuantity = ({ row, className }: Props) => {
	const product = row.original;
	const stockQuantity = useObservableEagerState(product.stock_quantity$);
	const manageStock = useObservableEagerState(product.manage_stock$);
	const { store } = useAppState();
	const decimalSeparator = useObservableEagerState(store.price_decimal_sep$);
	const displayStockQuantity = String(stockQuantity).replace('.', decimalSeparator);

	return manageStock && isFinite(stockQuantity) ? (
		<Text className={className}>{displayStockQuantity}</Text>
	) : null;
};
