import * as React from 'react';

import get from 'lodash/get';
import Animated, { useAnimatedStyle, withTiming, Easing } from 'react-native-reanimated';
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
import Variations from '../../../components/product/variation-table-rows';
import { VariationTableContext } from '../../../components/product/variation-table-rows/context';
import usePushDocument from '../../../contexts/use-push-document';
import { updateVariationQueryState } from '../../../contexts/variations';
import Actions from '../cells/actions';
import Barcode from '../cells/barcode';
import EdittablePrice from '../cells/edittable-price';
import Name from '../cells/name';
import StockQuanity from '../cells/stock-quantity';
import VariationActions from '../cells/variation-actions';

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

const variationCells = {
	actions: VariationActions,
	price: EdittablePrice,
	sale_price: EdittablePrice,
	regular_price: EdittablePrice,
	stock_quantity: StockQuanity,
	date_created: DateCreated,
	date_modified: DateCreated,
	barcode: Barcode,
};

/**
 *
 */
const VariableProductTableRow = ({ item, index, target }: ListRenderItemInfo<ProductDocument>) => {
	const addSnackbar = useSnackbar();
	const pushDocument = usePushDocument();
	const [variationQuery, _setVariationQuery] = React.useState(null);

	/**
	 *
	 */
	const setVariationQuery = React.useCallback((attribute) => {
		_setVariationQuery((prev) => updateVariationQueryState(prev, attribute));
	}, []);

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

	/**
	 *
	 */
	const variationTableContext = React.useMemo(() => {
		return {
			variationQuery,
			setVariationQuery,
			cells: variationCells,
		};
	}, [setVariationQuery, variationQuery]);

	/**
	 *
	 */
	const animatedStyle = useAnimatedStyle(() => {
		return {
			height: withTiming(
				variationQuery ? 500 : 100,
				{
					duration: 500,
					easing: Easing.out(Easing.exp),
				},
				() => {}
			),
		};
	});

	/**
	 *
	 */
	return (
		<VariationTableContext.Provider value={variationTableContext}>
			<Table.Row item={item} index={index} cellRenderer={cellRenderer} />
			{!!variationQuery && (
				<Animated.View style={animatedStyle}>
					<Variations parent={item} />
				</Animated.View>
			)}
		</VariationTableContext.Provider>
	);
};

export default VariableProductTableRow;
