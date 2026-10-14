import { type EngineRecord, useRecordField } from '@wcpos/query';
import type { CellContext } from '@wcpos/core/table-types';

import { useT } from '../../../../../contexts/translations';
import { displayStockStatus } from '../../../components/product/resolve-stock';
import { moneyRow } from '../v2/grid/tile-words';

/**
 *
 */
export function Price({ row, column }: CellContext<{ record: EngineRecord<'products'> }, 'price'>) {
	const price = useRecordField(row.original.record, (product) => product.payload.price);
	const regular_price = useRecordField(
		row.original.record,
		(product) => product.payload.regular_price
	);
	const taxStatus = useRecordField(row.original.record, (product) => product.payload.tax_status);
	const taxClass = useRecordField(row.original.record, (product) => product.payload.tax_class);
	const onSale = useRecordField(row.original.record, (product) => product.payload.on_sale);

	const t = useT();
	const out = useRecordField(
		row.original.record,
		({ payload }) => displayStockStatus(payload) === 'outofstock'
	);
	const meta = column.columnDef.meta;
	const show = meta?.show ?? (() => false);

	/**
	 *
	 */
	const taxDisplay = show('tax') ? ('text' as const) : ('tooltip' as const);
	const safeTaxStatus = (taxStatus || 'none') as 'taxable' | 'shipping' | 'none';

	return moneyRow({
		price: price ?? '',
		regularPrice: regular_price,
		onSale,
		taxStatus: safeTaxStatus,
		taxClass,
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
