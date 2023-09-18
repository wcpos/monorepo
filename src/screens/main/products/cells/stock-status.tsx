import * as React from 'react';

import { useObservableState } from 'observable-hooks';

import Text from '@wcpos/components/src/text';

import { useT } from '../../../../contexts/translations';

type ProductDocument = import('@wcpos/database').ProductDocument;

type Props = {
	item: ProductDocument;
	onChange: (product: ProductDocument, data: Record<string, unknown>) => void;
};

export const StockStatus = ({ item: product, onChange }: Props) => {
	const stockStatus = useObservableState(product.stock_status$, product.stock_status);

	return <Text>{stockStatus}</Text>;
};
