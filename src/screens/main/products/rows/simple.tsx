import * as React from 'react';

import get from 'lodash/get';

import { ErrorBoundary } from '@wcpos/tailwind/src/error-boundary';
import { Suspense } from '@wcpos/tailwind/src/suspense';
import Table, { CellRenderer } from '@wcpos/tailwind/src/table';
import { Text } from '@wcpos/tailwind/src/text';
import log from '@wcpos/utils/src/logger';

import { Date } from '../../components/date';
import { ProductCategories } from '../../components/product/categories';
import { ProductImage } from '../../components/product/image';
import { ProductTags } from '../../components/product/tags';
import { useMutation } from '../../hooks/mutations/use-mutation';
import { Actions } from '../cells/actions';
import { Barcode } from '../cells/barcode';
import { EdittablePrice } from '../cells/edittable-price';
import { ProductName } from '../cells/name';
import Price from '../cells/price';
import { StockQuantity } from '../cells/stock-quantity';
import { StockStatus } from '../cells/stock-status';

import type { ListRenderItemInfo } from '@shopify/flash-list';
type ProductDocument = import('@wcpos/database').ProductDocument;

export const cells = {
	actions: Actions,
	categories: ProductCategories,
	image: ProductImage,
	name: ProductName,
	barcode: Barcode,
	price: Price,
	regular_price: EdittablePrice,
	sale_price: EdittablePrice,
	date_created: Date,
	date_modified: Date,
	stock_quantity: StockQuantity,
	tags: ProductTags,
	stock_status: StockStatus,
};

/**
 *
 */
export const SimpleProductTableRow = ({ item, index }: ListRenderItemInfo<ProductDocument>) => {
	const { patch } = useMutation({ collectionName: 'products' });

	/**
	 *
	 */
	const handleChange = React.useCallback(
		async (product: ProductDocument, data: Record<string, unknown>) => {
			patch({ document: product, data });
		},
		[patch]
	);

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
							<Cell
								item={item.document}
								column={column}
								index={index}
								cellWidth={cellWidth}
								onChange={handleChange}
							/>
						</Suspense>
					</ErrorBoundary>
				);
			}

			if (item.document[column.key]) {
				return <Text>{String(item.document[column.key])}</Text>;
			}

			return null;
		},
		[handleChange]
	);

	return <Table.Row item={item} index={index} cellRenderer={cellRenderer} />;
};
