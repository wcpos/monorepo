import * as React from 'react';

import { useObservableState } from 'observable-hooks';

import { Text } from '@wcpos/tailwind/src/text';

type SKUProps = {
	item: import('@wcpos/database').ProductDocument;
};

export const SKU = ({ item: product }: SKUProps) => {
	const sku = useObservableState(product.sku$, product.sku);

	return <Text>{sku}</Text>;
};
