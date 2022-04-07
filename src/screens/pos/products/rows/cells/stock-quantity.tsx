import * as React from 'react';
import isFinite from 'lodash/isFinite';
import Text from '@wcpos/common/src/components/text';

type Props = {
	item: import('@wcpos/common/src/database').ProductDocument;
};

const StockQuantity = ({ item: product }: Props) => {
	return product.manage_stock && isFinite(product.stock_quantity) ? (
		<Text size="small">{product.stock_quantity}</Text>
	) : null;
};

export default StockQuantity;
