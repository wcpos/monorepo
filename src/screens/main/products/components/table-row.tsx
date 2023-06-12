import * as React from 'react';

import get from 'lodash/get';
import { useObservableState } from 'observable-hooks';
import { isRxDocument } from 'rxdb';
import { map } from 'rxjs/operators';

import Box from '@wcpos/components/src/box';
import ErrorBoundary from '@wcpos/components/src/error-boundary';
import useSnackbar from '@wcpos/components/src/snackbar';
import Table, { CellRenderer } from '@wcpos/components/src/table';
import Text from '@wcpos/components/src/text';
import log from '@wcpos/utils/src/logger';

import Actions from './cells/actions';
import Barcode from './cells/barcode';
import EdittablePrice from './cells/edittable-price';
import Name from './cells/name';
import Price from './cells/price';
import StockQuanity from './cells/stock-quantity';
import Variations from './variations';
import { t } from '../../../../lib/translations';
import DateCreated from '../../components/date';
import Categories from '../../components/product/categories';
import { ProductImage } from '../../components/product/image';
import Tags from '../../components/product/tags';
import VariablePrice from '../../components/product/variable-price';
import VariableTableRow from '../../components/product/variable-table-row';
import usePushDocument from '../../contexts/use-push-document';

import type { ListRenderItemInfo } from '@shopify/flash-list';
type ProductDocument = import('@wcpos/database').ProductDocument;

const cells = {
	simple: {
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
	},
	variable: {
		price: VariablePrice,
		regular_price: VariablePrice,
		sale_price: VariablePrice,
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
	const addSnackbar = useSnackbar();
	const pushDocument = usePushDocument();
	/**
	 *
	 */
	const handleChange = React.useCallback(
		async (product: ProductDocument, data: Record<string, unknown>) => {
			try {
				const latest = product.getLatest();
				const doc = await latest.patch(data);
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
			const Cell = get(cells, [item.type, column.key], cells.simple[column.key]);

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

	/**
	 *
	 */
	if (item.type === 'variable') {
		return (
			<VariableTableRow
				item={item}
				index={index}
				extraData={extraData}
				target={target}
				cellRenderer={cellRenderer}
			>
				<Variations parent={item} parentIndex={index} extraData={extraData} />
			</VariableTableRow>
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
