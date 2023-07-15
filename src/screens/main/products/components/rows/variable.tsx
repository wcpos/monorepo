import * as React from 'react';

import get from 'lodash/get';
import { isRxDocument } from 'rxdb';

import ErrorBoundary from '@wcpos/components/src/error-boundary';
import useSnackbar from '@wcpos/components/src/snackbar';
import Table, { CellRenderer } from '@wcpos/components/src/table';
import Text from '@wcpos/components/src/text';
import log from '@wcpos/utils/src/logger';

import { t } from '../../../../../lib/translations';
import DateCreated from '../../../components/date';
import Categories from '../../../components/product/categories';
import { ProductImage } from '../../../components/product/image';
import Tags from '../../../components/product/tags';
import VariablePrice from '../../../components/product/variable-price';
import usePushDocument from '../../../contexts/use-push-document';
import Actions from '../cells/actions';
import Barcode from '../cells/barcode';
import Name from '../cells/name';
import StockQuanity from '../cells/stock-quantity';

import type { ListRenderItemInfo } from '@shopify/flash-list';
type ProductDocument = import('@wcpos/database').ProductDocument;

const cells = {
	actions: Actions,
	categories: Categories,
	image: ProductImage,
	name: Name,
	barcode: Barcode,
	price: VariablePrice,
	regular_price: VariablePrice,
	sale_price: VariablePrice,
	date_created: DateCreated,
	date_modified: DateCreated,
	stock_quantity: StockQuanity,
	tags: Tags,
};

/**
 *
 */
const VariableProductTableRow = ({
	item,
	index,
	extraData,
	target,
}: ListRenderItemInfo<ProductDocument>) => {
	const addSnackbar = useSnackbar();
	const pushDocument = usePushDocument();

	/**
	 *
	 */
	const handleChange = React.useCallback(
		async (product: ProductDocument, data: Record<string, unknown>) => {
			try {
				// const latest = product.getLatest();
				// const doc = await product.patch({ ...data, _rev: '4-trwnvfmnjs' });
				const doc = await product.patch(data);
				const success = await pushDocument(doc);
				if (isRxDocument(success)) {
					addSnackbar({
						message: t('Product {id} saved', { _tags: 'core', id: success.id }),
					});
				}
			} catch (error) {
				log.error(error);
				addSnackbar({
					message: t('There was an error: {message}', { _tags: 'core', message: error.message }),
				});
			}
		},
		[addSnackbar, pushDocument]
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
						<React.Suspense>
							<Cell
								item={item}
								column={column}
								index={index}
								cellWidth={cellWidth}
								onChange={handleChange}
							/>
						</React.Suspense>
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

export default VariableProductTableRow;
