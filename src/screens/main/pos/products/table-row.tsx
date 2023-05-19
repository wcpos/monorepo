import * as React from 'react';

import get from 'lodash/get';

import ErrorBoundary from '@wcpos/components/src/error-boundary';
import Table, { CellRenderer } from '@wcpos/components/src/table';
import Text from '@wcpos/components/src/text';

import { Actions } from './cells/actions';
import { Name } from './cells/name';
import { Price } from './cells/price';
import { SKU } from './cells/sku';
import { StockQuantity } from './cells/stock-quantity';
import VariableActions from './cells/variable-actions';
import Variations from './variations';
import { ProductImage } from '../../components/product/image';
import VariablePrice from '../../components/product/variable-price';
import VariableProductTableRow from '../../components/product/variable-table-row';

import type { ListRenderItemInfo } from '@shopify/flash-list';
type ProductDocument = import('@wcpos/database').ProductDocument;

const cells = {
	simple: {
		actions: Actions,
		image: ProductImage,
		name: Name,
		price: Price,
		sku: SKU,
		stock_quantity: StockQuantity,
	},
	variable: {
		actions: VariableActions,
		image: ProductImage,
		name: Name,
		price: VariablePrice,
		sku: SKU,
		stock_quantity: StockQuantity,
	},
	grouped: {},
};

/**
 *
 * @param param0
 * @returns
 */
const ProductTableRow = ({
	item,
	index,
	extraData,
	target,
}: ListRenderItemInfo<ProductDocument>) => {
	/**
	 *
	 */
	const cellRenderer = React.useCallback<CellRenderer<ProductDocument>>(
		({ item, column, index, cellWidth }) => {
			const Cell = get(cells, [item.type, column.key], cells.simple[column.key]);

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
	if (item.type === 'variable') {
		return (
			<VariableProductTableRow
				item={item}
				index={index}
				extraData={extraData}
				target={target}
				cellRenderer={cellRenderer}
			>
				<Variations parent={item} parentIndex={index} extraData={extraData} />
			</VariableProductTableRow>
		);
	}

	/**
	 *
	 */
	return (
		<Table.Row
			item={item}
			index={index}
			extraData={extraData}
			target={target}
			cellRenderer={cellRenderer}
		/>
	);
};

export default ProductTableRow;
