import type { EngineRecord } from '@wcpos/query';

import { Actions } from '../cells/actions';
import { COGS } from '../cells/cogs';
import { Name } from '../cells/name';
import { Price } from '../cells/price';
import { SKU } from '../cells/sku';
import { StockQuantity } from '../cells/stock-quantity';
import { VariableActions } from '../cells/variable-actions';
import { ProductImage } from '../../../components/product/image';
import { VariableProductImage } from '../../../components/product/variable-image';
import { VariableProductPrice } from '../../../components/product/variable-price';

import type { Row } from '../../../../../table-types';
import type { DataTableFeatures } from '../../../components/data-table/v2';

type ProductRow = { record: EngineRecord<'products'> };

const cells = {
	simple: {
		actions: Actions,
		image: ProductImage,
		name: Name,
		price: Price,
		sku: SKU,
		stock_quantity: StockQuantity,
		cost_of_goods_sold: COGS,
	},
	variable: {
		actions: VariableActions,
		image: VariableProductImage,
		name: Name,
		price: VariableProductPrice,
		stock_quantity: StockQuantity,
		sku: SKU,
		cost_of_goods_sold: COGS,
	},
};

/** The POS products table's cells for a row: a variable product prices and acts as a range. */
export function cellsForRow(row: Row<ProductRow, DataTableFeatures>) {
	return row.original.record.payload.type === 'variable' ? cells.variable : cells.simple;
}
