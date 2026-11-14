import * as React from 'react';

import { StockPill } from '@wcpos/components/poster-tile';
import { type EngineRecord, useRecordField } from '@wcpos/query';

import { useT } from '../../../../../contexts/translations';
import { displayStockStatus } from '../../../components/product/resolve-stock';
import { stockMark } from '../tiles/tile-words';

type Props = {
	row: { original: { record: EngineRecord<'products'> | EngineRecord<'variations'> } };
};

/**
 *
 */
export function StockQuantity({ row }: Props) {
	const payload = useRecordField(row.original.record, (record) => record.payload);
	const t = useT();
	const stock = stockMark({
		gridFields: {
			name: false,
			price: false,
			tax: false,
			on_sale: false,
			category: false,
			sku: false,
			barcode: false,
			stock_quantity: true,
			cost_of_goods_sold: false,
		},
		manageStock: payload.manage_stock,
		stockQuantity: payload.stock_quantity,
		lowStockAmount: payload.low_stock_amount,
		status: displayStockStatus(payload),
		t,
	});
	if (!stock) return null;
	if (stock.mark.kind === 'count') return <StockPill {...stock.mark} label={stock.label} />;
	return stock.mark.kind === 'backorder' ? <StockPill backorder label={stock.label} /> : null;
}
