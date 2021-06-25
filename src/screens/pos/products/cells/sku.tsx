import * as React from 'react';
import Text from '@wcpos/common/src/components/text';

type SKUProps = {
	item: import('@wcpos/common/src/database').ProductDocument;
};

const SKU = ({ item: product }: SKUProps) => {
	return product.isSynced() ? <Text>{product.sku}</Text> : <Text.Skeleton length="short" />;
};

export default SKU;
