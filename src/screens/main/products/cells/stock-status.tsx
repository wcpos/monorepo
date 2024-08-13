import * as React from 'react';

import { useObservableEagerState } from 'observable-hooks';

import { CellContext } from '@wcpos/tailwind/src/data-table';
import { Text } from '@wcpos/tailwind/src/text';

import { useStockStatusLabel } from '../../hooks/use-stock-status-label';

type ProductDocument = import('@wcpos/database').ProductDocument;

/**
 *
 */
export const StockStatus = ({ row }: CellContext<ProductDocument, 'stock_status'>) => {
	const product = row.original;
	const stockStatus = useObservableEagerState(product.stock_status$);
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
