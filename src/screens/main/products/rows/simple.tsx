import * as React from 'react';

import get from 'lodash/get';

import ErrorBoundary from '@wcpos/components/src/error-boundary';
import Suspense from '@wcpos/components/src/suspense';
import Table, { CellRenderer } from '@wcpos/components/src/table';
import Text from '@wcpos/components/src/text';
import log from '@wcpos/utils/src/logger';

import DateCreated from '../../components/date';
import Categories from '../../components/product/categories';
import { ProductImage } from '../../components/product/image';
import Tags from '../../components/product/tags';
import { useMutation } from '../../hooks/use-mutation';
import Actions from '../cells/actions';
import Barcode from '../cells/barcode';
import EdittablePrice from '../cells/edittable-price';
import Name from '../cells/name';
import Price from '../cells/price';
import StockQuanity from '../cells/stock-quantity';
import { StockStatus } from '../cells/stock-status';

import type { ListRenderItemInfo } from '@shopify/flash-list';
type ProductDocument = import('@wcpos/database').ProductDocument;

const cells = {
	actions: Actions,
	categories: Categories,
	image: ProductImage,
	name: Name,
	barcode: Barcode,
	price: Price,
	regular_price: EdittablePrice,
	sale_price: EdittablePrice,
	date_created: DateCreated,
	date_modified: DateCreated,
	stock_quantity: StockQuanity,
	tags: Tags,
	stock_status: StockStatus,
};

/**
 *
 */
const SimpleProductTableRow = ({ item, index }: ListRenderItemInfo<ProductDocument>) => {
	const mutation = useMutation();

	/**
	 *
	 */
	const handleChange = React.useCallback(
		async (product: ProductDocument, data: Record<string, unknown>) => {
			mutation.mutate({ document: product, data });
		},
		[mutation]
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
								item={item}
								column={column}
								index={index}
								cellWidth={cellWidth}
								onChange={handleChange}
							/>
						</Suspense>
					</ErrorBoundary>
				);
			}

			if (item[column.key]) {
				return <Text>{String(item[column.key])}</Text>;
			}

			return null;
		},
		[handleChange]
	);

	return <Table.Row item={item} index={index} cellRenderer={cellRenderer} />;
};

export default SimpleProductTableRow;
