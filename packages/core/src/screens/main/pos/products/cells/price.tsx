import { type EngineRecord, useRecordField } from '@wcpos/query';
import type { CellContext } from '@wcpos/core/table-types';

import { useT } from '../../../../../contexts/translations';
import { displayStockStatus } from '../../../components/product/resolve-stock';
import { moneyRow } from '../tiles/tile-words';

/**
 *
 */
export function Price({ row, column }: CellContext<{ record: EngineRecord<'products'> }, 'price'>) {
	// One subscription for the cell; the hook's deep-equal dedupe keeps the object stable.
	const { price, regular_price, tax_status, tax_class, on_sale, out } = useRecordField(
		row.original.record,
		({ payload }) => ({
			price: payload.price,
			regular_price: payload.regular_price,
			tax_status: payload.tax_status,
			tax_class: payload.tax_class,
			on_sale: payload.on_sale,
			out: displayStockStatus(payload) === 'outofstock',
		})
	);
	const t = useT();
	const meta = column.columnDef.meta;
	const show = meta?.show ?? (() => false);

	/**
	 *
	 */
	const taxDisplay = show('tax') ? ('text' as const) : ('tooltip' as const);
	const safeTaxStatus = (tax_status || 'none') as 'taxable' | 'shipping' | 'none';

	return moneyRow({
		price: price ?? '',
		regularPrice: regular_price,
		onSale: on_sale,
		taxStatus: safeTaxStatus,
		taxClass: tax_class,
		taxDisplay,
		out,
		t,
		gridFields: {
			name: false,
			price: true,
			tax: show('tax'),
			on_sale: show('on_sale'),
			category: false,
			sku: false,
			barcode: false,
			stock_quantity: false,
			cost_of_goods_sold: false,
		},
	});
}
