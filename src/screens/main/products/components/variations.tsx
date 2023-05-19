import * as React from 'react';

import get from 'lodash/get';
import { useObservableSuspense } from 'observable-hooks';
import { isRxDocument } from 'rxdb';

import Box from '@wcpos/components/src/box';
import Button from '@wcpos/components/src/button';
import ErrorBoundary from '@wcpos/components/src/error-boundary';
import useSnackbar from '@wcpos/components/src/snackbar';
import Table, { CellRenderer } from '@wcpos/components/src/table';
import Text from '@wcpos/components/src/text';
import log from '@wcpos/utils/src/logger';

import Barcode from './cells/barcode';
import EdittablePrice from './cells/edittable-price';
import Price from './cells/price';
import StockQuanity from './cells/stock-quantity';
import Actions from './cells/variation-actions';
import { t } from '../../../../lib/translations';
import { ProductVariationImage } from '../../components/product/variation-image';
import { ProductVariationName } from '../../components/product/variation-name';
import FilterBar from '../../components/product/variation-table-rows/filter-bar';
import Footer from '../../components/product/variation-table-rows/footer';
import usePushDocument from '../../contexts/use-push-document';
import useVariations from '../../contexts/variations';

type ProductDocument = import('@wcpos/database').ProductDocument;
type ProductVariationDocument = import('@wcpos/database').ProductVariationDocument;

interface VariationsProps {
	extraData: any;
	parent: ProductDocument;
	parentIndex: number;
}

const cells = {
	actions: Actions,
	barcode: Barcode,
	image: ProductVariationImage,
	name: ProductVariationName,
	price: Price,
	regular_price: EdittablePrice,
	sale_price: EdittablePrice,
	stock_quantity: StockQuanity,
};

/**
 *
 */
const Variations = ({ extraData, parent, parentIndex }: VariationsProps) => {
	const { resource } = useVariations();
	const variations = useObservableSuspense(resource);
	const addSnackbar = useSnackbar();
	const pushDocument = usePushDocument();

	/**
	 *
	 */
	const handleChange = React.useCallback(
		async (product: ProductVariationDocument, data: Record<string, unknown>) => {
			try {
				const latest = product.getLatest();
				const doc = await latest.patch(data);
				const success = await pushDocument(doc, parent);
				if (isRxDocument(success)) {
					addSnackbar({
						message: t('Variation {id} saved', { _tags: 'core', id: success.id }),
					});
				}
			} catch (error) {
				log.error(error);
				addSnackbar({
					message: t('There was an error: {message}', { _tags: 'core', message: error.message }),
				});
			}
		},
		[addSnackbar, parent, pushDocument]
	);

	/**
	 *
	 */
	const cellRenderer = React.useCallback<CellRenderer<ProductVariationDocument>>(
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
								parent={parent}
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
		[handleChange, parent]
	);

	/**
	 *
	 */
	return (
		<Box style={{ borderLeftWidth: 2 }}>
			<FilterBar parent={parent} />
			{variations.map((variation, index) => {
				return (
					<Table.Row
						key={variation.uuid}
						item={variation}
						extraData={extraData}
						cellRenderer={cellRenderer}
						index={parentIndex + 1 + index}
					/>
				);
			})}
			<Footer count={variations.length} parent={parent} />
		</Box>
	);
};

export default Variations;
