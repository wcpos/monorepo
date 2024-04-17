import * as React from 'react';

import { useObservableState } from 'observable-hooks';

import Text from '@wcpos/components/src/text';

import { useStockStatusLabel } from '../../hooks/use-stock-status-label';

type ProductDocument = import('@wcpos/database').ProductDocument;

type Props = {
	item: ProductDocument;
	onChange: (product: ProductDocument, data: Record<string, unknown>) => void;
};

export const StockStatus = ({ item: product, onChange }: Props) => {
	const stockStatus = useObservableState(product.stock_status$, product.stock_status);
	const { getLabel } = useStockStatusLabel();

	const type = React.useMemo(() => {
		switch (stockStatus) {
			case 'instock':
				return 'success';
			case 'outofstock':
				return 'critical';
			case 'onbackorder':
				return 'warning';
			case 'lowstock':
				return 'warning';
			default:
				return 'primary';
		}
	}, [stockStatus]);

	return (
		<Text type={type} align="center" size="small">
			{getLabel(stockStatus)}
		</Text>
	);
};
