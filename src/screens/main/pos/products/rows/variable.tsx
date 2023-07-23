import * as React from 'react';

import get from 'lodash/get';

import ErrorBoundary from '@wcpos/components/src/error-boundary';
import Table, { CellRenderer } from '@wcpos/components/src/table';
import Text from '@wcpos/components/src/text';

import { ProductImage } from '../../../components/product/image';
import VariablePrice from '../../../components/product/variable-price';
import Variations from '../../../components/product/variation-table-rows';
import { VariationTableContext } from '../../../components/product/variation-table-rows/context';
import { Name } from '../cells/name';
import { Price } from '../cells/price';
import { SKU } from '../cells/sku';
import { StockQuantity } from '../cells/stock-quantity';
import VariableActions from '../cells/variable-actions';
import { ProductVariationActions } from '../cells/variation-actions';

import type { ListRenderItemInfo } from '@shopify/flash-list';
type ProductDocument = import('@wcpos/database').ProductDocument;

const cells = {
	actions: VariableActions,
	image: ProductImage,
	name: Name,
	price: VariablePrice,
	stock_quantity: StockQuantity,
	sku: SKU,
};

const variationCells = {
	actions: ProductVariationActions,
	stock_quantity: StockQuantity,
	price: Price,
	sku: SKU,
};

/**
 *
 */
const VariableProductTableRow = ({ item, index }: ListRenderItemInfo<ProductDocument>) => {
	const [variationQuery, setVariationQuery] = React.useState(null);

	/**
	 *
	 */
	const cellRenderer = React.useCallback<CellRenderer<ProductDocument>>(
		({ item, column, index, cellWidth }) => {
			const Cell = get(cells, column.key);

			if (Cell) {
				return (
					<ErrorBoundary>
						<React.Suspense>
							<Cell item={item} column={column} index={index} cellWidth={cellWidth} />
						</React.Suspense>
					</ErrorBoundary>
				);
			}

			if (item[column.key]) {
				return <Text>{String(item[column.key])}</Text>;
			}

			return null;
		},
		[]
	);

	/**
	 *
	 */
	const variationQueryContext = React.useMemo(() => {
		return {
			variationQuery,
			setVariationQuery,
			cells: variationCells,
		};
	}, [variationQuery]);

	/**
	 *
	 */
	return (
		<VariationTableContext.Provider value={variationQueryContext}>
			<Table.Row item={item} index={index} cellRenderer={cellRenderer} />
			{!!variationQuery && <Variations parent={item} />}
		</VariationTableContext.Provider>
	);
};

export default VariableProductTableRow;
