import * as React from 'react';
import Text from '@wcpos/common/src/components/text';

type PriceProps = {
	product: import('@wcpos/common/src/database').ProductDocument;
};

const Price = ({ product }: PriceProps) => {
	return product.isSynced() ? <Text>{product.price}</Text> : <Text.Skeleton length="short" />;
};

export default Price;
