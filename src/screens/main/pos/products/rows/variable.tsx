import * as React from 'react';

import get from 'lodash/get';

import ErrorBoundary from '@wcpos/components/src/error-boundary';
import Table, { CellRenderer } from '@wcpos/components/src/table';
import Text from '@wcpos/components/src/text';

import Variations from './variations';
import { ProductImage } from '../../../components/product/image';
import VariablePrice from '../../../components/product/variable-price';
import { Name } from '../cells/name';
import { SKU } from '../cells/sku';
import { StockQuantity } from '../cells/stock-quantity';
import VariableActions from '../cells/variable-actions';

import type { ListRenderItemInfo } from '@shopify/flash-list';
type ProductDocument = import('@wcpos/database').ProductDocument;

const cells = {
	actions: VariableActions,
	image: ProductImage,
	name: Name,
	price: VariablePrice,
	sku: SKU,
	stock_quantity: StockQuantity,
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

			if (column.key === 'name') {
				return (
					<ErrorBoundary>
						<React.Suspense>
							<Cell
								item={item}
								column={column}
								index={index}
								cellWidth={cellWidth}
								variationQuery={variationQuery}
								setVariationQuery={setVariationQuery}
							/>
						</React.Suspense>
					</ErrorBoundary>
				);
			}

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
		[variationQuery]
	);

	return (
		<>
			<Table.Row item={item} index={index} cellRenderer={cellRenderer} />
			{!!variationQuery && <Variations parent={item} variationQuery={variationQuery} />}
		</>
	);
};

export default VariableProductTableRow;
