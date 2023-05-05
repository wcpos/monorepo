import * as React from 'react';

import isFinite from 'lodash/isFinite';
import { useObservableState } from 'observable-hooks';

import Text from '@wcpos/components/src/text';

type Props = {
	item: import('@wcpos/database').ProductDocument;
};

export const StockQuantity = ({ item: product }: Props) => {
	const stockQuantity = useObservableState(product.stock_quantity$, product.stock_quantity);
	const manageStock = useObservableState(product.manage_stock$, product.manage_stock);

	return manageStock && isFinite(stockQuantity) ? <Text>{stockQuantity}</Text> : null;
};
