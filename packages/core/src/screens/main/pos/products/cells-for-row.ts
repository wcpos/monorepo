import type { EngineRecord } from '@wcpos/query';

import { Actions } from './cells/actions';
import { COGS } from './cells/cogs';
import { Name } from './cells/name';
import { Price } from './cells/price';
import { Type } from './cells/type';
import { SKU } from './cells/sku';
import { StockQuantity } from './cells/stock-quantity';
import { VariableActions } from './cells/variable-actions';
import { PosProductImage } from './cells/image';
import { PosVariableProductImage } from './cells/variable-image';
import { PosVariablePrice } from './cells/variable-price';

import type { Row } from '../../../../table-types';
import type { DataTableFeatures } from '../../components/data-table';

type ProductRow = { record: EngineRecord<'products'> };

const cells = {
	simple: {
		actions: Actions,
		image: PosProductImage,
		name: Name,
		price: Price,
		sku: SKU,
		type: Type,
		stock_quantity: StockQuantity,
		cost_of_goods_sold: COGS,
	},
	variable: {
		actions: VariableActions,
		image: PosVariableProductImage,
		name: Name,
		price: PosVariablePrice,
		stock_quantity: StockQuantity,
		sku: SKU,
		type: Type,
		cost_of_goods_sold: COGS,
	},
};

/** The POS products table's cells for a row: a variable product prices and acts as a range. */
export function cellsForRow(row: Row<ProductRow, DataTableFeatures>) {
	return row.original.record.payload.type === 'variable' ? cells.variable : cells.simple;
}
