import * as React from 'react';
import Text from '@wcpos/components/src/text';

type SKUProps = {
	item: import('@wcpos/database').ProductDocument;
};

export const SKU = ({ item: product }: SKUProps) => {
	return product.isSynced() ? <Text>{product.sku}</Text> : <Text.Skeleton length="short" />;
};

export default SKU;
