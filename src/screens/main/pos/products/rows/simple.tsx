import * as React from 'react';

import get from 'lodash/get';

import ErrorBoundary from '@wcpos/components/src/error-boundary';
import Suspense from '@wcpos/components/src/suspense';
import Table, { CellRenderer } from '@wcpos/tailwind/src/table';
import Text from '@wcpos/components/src/text';

import { ProductImage } from '../../../components/product/image';
import { Actions } from '../cells/actions';
import { Name } from '../cells/name';
import { Price } from '../cells/price';
import { SKU } from '../cells/sku';
import { StockQuantity } from '../cells/stock-quantity';

import type { ListRenderItemInfo } from '@shopify/flash-list';
type ProductDocument = import('@wcpos/database').ProductDocument;

const cells = {
	actions: Actions,
	image: ProductImage,
	name: Name,
	price: Price,
	sku: SKU,
	stock_quantity: StockQuantity,
};

/**
 *
 */
const SimpleProductTableRow = ({ item, index, target }: ListRenderItemInfo<ProductDocument>) => {
	/**
	 *
	 */
	const cellRenderer = React.useCallback<CellRenderer<ProductDocument>>(
		({ item, column, index, cellWidth }) => {
			const Cell = get(cells, column.key);

			if (Cell) {
				return (
					<ErrorBoundary>
						<Suspense>
							<Cell item={item.document} column={column} index={index} cellWidth={cellWidth} />
						</Suspense>
					</ErrorBoundary>
				);
			}

			if (item.document[column.key]) {
				return <Text>{String(item.document[column.key])}</Text>;
			}

			return null;
		},
		[]
	);

	return <Table.Row item={item} index={index} target={target} cellRenderer={cellRenderer} />;
};

export default SimpleProductTableRow;
