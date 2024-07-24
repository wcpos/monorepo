import * as React from 'react';

import { useObservableState } from 'observable-hooks';

import { Text } from '@wcpos/tailwind/src/text';

import { useStockStatusLabel } from '../../hooks/use-stock-status-label';

type ProductDocument = import('@wcpos/database').ProductDocument;

type Props = {
	item: ProductDocument;
	onChange: (product: ProductDocument, data: Record<string, unknown>) => void;
};

export const StockStatus = ({ item: product, onChange }: Props) => {
	const stockStatus = useObservableState(product.stock_status$, product.stock_status);
	const { getLabel } = useStockStatusLabel();

	const classNames = React.useMemo(() => {
		switch (stockStatus) {
			case 'instock':
				return 'text-success';
			case 'outofstock':
				return 'text-destructive';
			case 'onbackorder':
				return 'text-warning';
			case 'lowstock':
				return 'text-warning';
			default:
				return '';
		}
	}, [stockStatus]);

	return <Text className={`text-sm text-center ${classNames}`}>{getLabel(stockStatus)}</Text>;
};
