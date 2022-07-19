import * as React from 'react';
import { useObservableState } from 'observable-hooks';
import isFinite from 'lodash/isFinite';
import Text from '@wcpos/components/src/text';

type Props = {
	item: import('@wcpos/database').ProductDocument;
};

const StockQuantity = ({ item: product }: Props) => {
	return product.manage_stock && isFinite(product.stock_quantity) ? (
		<Text>{product.stock_quantity}</Text>
	) : null;
};

export default StockQuantity;
