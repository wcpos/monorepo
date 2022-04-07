import * as React from 'react';
import { useObservableState } from 'observable-hooks';
import Text from '@wcpos/common/src/components/text';

type Props = {
	item: import('@wcpos/common/src/database').ProductDocument;
};

const StockQuantity = ({ item: product }: Props) => {
	const stockQuantity = useObservableState(product.stock_quantity$, product.stock_quantity);

	return <Text>{stockQuantity}</Text>;
};

export default StockQuantity;
