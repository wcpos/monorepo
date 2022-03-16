import * as React from 'react';
import Text from '@wcpos/common/src/components/text';

type PriceProps = {
	item: import('@wcpos/common/src/database').ProductDocument;
};

const Price = ({ item: product }: PriceProps) => {
	return product.isSynced() ? <Text>{product.price}</Text> : <Text.Skeleton length="short" />;
};

export default Price;
