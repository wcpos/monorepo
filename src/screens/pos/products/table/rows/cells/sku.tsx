import * as React from 'react';
import Text from '@wcpos/common/src/components/text';

type SKUProps = {
	product: import('@wcpos/common/src/database').ProductDocument;
};

const SKU = ({ product }: SKUProps) => {
	return product.isSynced() ? <Text>{product.sku}</Text> : <Text.Skeleton length="short" />;
};

export default SKU;
