import * as React from 'react';

import { useObservableEagerState } from 'observable-hooks';

import { ButtonPill } from '@wcpos/components/button';

import { useStockStatusLabel } from '../../hooks/use-stock-status-label';

import type { CellContext } from '@tanstack/react-table';

type ProductDocument = import('@wcpos/database').ProductDocument;

/**
 *
 */
export const StockStatus = ({
	table,
	row,
}: CellContext<{ document: ProductDocument }, 'stock_status'>) => {
	const product = row.original.document;
	const stockStatus = useObservableEagerState(product.stock_status$);
	const { getLabel } = useStockStatusLabel();
	const { query } = table.options.meta;

	const variant = React.useMemo(() => {
		switch (stockStatus) {
			case 'instock':
				return 'ghost-success';
			case 'outofstock':
				return 'ghost-destructive';
			case 'onbackorder':
				return 'ghost-warning';
			case 'lowstock':
				return 'ghost-warning';
			default:
				return 'ghost';
		}
	}, [stockStatus]);

	return (
		<ButtonPill
			size="xs"
			variant={variant}
			onPress={() => query.where('stock_status').equals(stockStatus).exec()}
		>
			{getLabel(stockStatus)}
		</ButtonPill>
	);
};
