import * as React from 'react';
import { useObservableState } from 'observable-hooks';
import Text from '@wcpos/components/src/text';

type Props = {
	item: import('@wcpos/database').ProductDocument;
};

const StockQuantity = ({ item: product }: Props) => {
	const stockQuantity = useObservableState(product.stock_quantity$, product.stock_quantity);

	return <Text>{stockQuantity}</Text>;
};

export default StockQuantity;
