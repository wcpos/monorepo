import { type EngineRecord, useRecordField } from '@wcpos/query';
import type { CellContext } from '@wcpos/core/table-types';

import { getVariablePrices } from './get-variable-prices';
import { useT } from '../../../../contexts/translations';
import { moneyRow } from '../../pos/products/v2/grid/tile-words';

import type { VariablePrices } from './get-variable-prices';

type PriceKey = keyof VariablePrices;

/**
 *
 */
export function VariableProductPrice({
	row,
	column,
}: CellContext<{ record: EngineRecord<'products'> }, 'price' | 'regular_price' | 'sale_price'>) {
	const taxStatus = useRecordField(row.original.record, (product) => product.payload.tax_status);
	const taxClass = useRecordField(row.original.record, (product) => product.payload.tax_class);
	const metaData = useRecordField(row.original.record, (product) => product.payload.meta_data);
	const owner = useRecordField(row.original.record, (product) => ({
		recordId: product.uuid,
		remoteId: product.remoteId,
		name: product.payload.name,
		sku: product.payload.sku,
		price: product.payload.price,
		regularPrice: product.payload.regular_price,
		salePrice: product.payload.sale_price,
	}));
	const variablePrices = getVariablePrices(metaData, owner);
	const key = column.id as PriceKey;
	const t = useT();
	const onSale = useRecordField(row.original.record, ({ payload }) => payload.on_sale);
	const show = column.columnDef.meta?.show ?? (() => false);
	const safeTaxStatus = taxStatus || 'none';

	if (!variablePrices || !variablePrices[key]) {
		return null;
	}

	const range = variablePrices[key];

	return moneyRow({
		price: range.min,
		regularPrice: variablePrices.regular_price?.min,
		onSale,
		taxStatus: safeTaxStatus,
		taxClass,
		taxDisplay: show('tax') ? 'text' : 'tooltip',
		from: range.min !== range.max,
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
