import * as React from 'react';

import get from 'lodash/get';
import isPlainObject from 'lodash/isPlainObject';
import { useObservableState } from 'observable-hooks';
import Animated, { useAnimatedStyle, withTiming, Easing } from 'react-native-reanimated';

import ErrorBoundary from '@wcpos/components/src/error-boundary';
import Suspense from '@wcpos/components/src/suspense';
import Table, { CellRenderer } from '@wcpos/components/src/table';
import Text from '@wcpos/components/src/text';
import log from '@wcpos/utils/src/logger';

import { Date } from '../../components/date';
import Categories from '../../components/product/categories';
import { ProductImage } from '../../components/product/image';
import Tags from '../../components/product/tags';
import VariablePrice from '../../components/product/variable-price';
import Variations from '../../components/product/variation-table-rows';
import { VariationTableContext } from '../../components/product/variation-table-rows/context';
import { useMutation } from '../../hooks/use-mutation';
import Actions from '../cells/actions';
import Barcode from '../cells/barcode';
import EdittablePrice from '../cells/edittable-price';
import Name from '../cells/name';
import StockQuanity from '../cells/stock-quantity';
import { StockStatus } from '../cells/stock-status';
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
	date_created: Date,
	date_modified: Date,
	stock_quantity: StockQuanity,
	tags: Tags,
	stock_status: StockStatus,
};

const variationCells = {
	actions: VariationActions,
	price: EdittablePrice,
	sale_price: EdittablePrice,
	regular_price: EdittablePrice,
	stock_quantity: StockQuanity,
	date_created: Date,
	date_modified: Date,
	barcode: Barcode,
	stock_status: StockStatus,
};

/**
 *
 */
const VariableProductTableRow = ({ item, index }: ListRenderItemInfo<ProductDocument>) => {
	const { patch } = useMutation({ collectionName: 'products' });
	const [expanded, setExpanded] = React.useState(false);
	const [initialSelectedAttributes, setInitialSelectedAttributes] = React.useState();

	/**
	 * Expand variations if there are search results
	 * - Let's not expend the variations by default, the UI is too messy
	 */
	// React.useEffect(() => {
	// 	setExpanded(!!item.childrenSearchCount);
	// }, [item.childrenSearchCount]);

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

	/**
	 * Create a new query for variations on:
	 * - change to variationIDs
	 * - change to expanded
	 *
	 * @TODO - sync sorting with parent product
	 * @TODO - fix hack for attribute click
	 */
	const variationTableContext = React.useMemo(() => {
		// if (typeof expanded === 'object') {
		// 	query.search({ attributes: [expanded] });
		// }

		return {
			expanded,
			setExpanded,
			setInitialSelectedAttributes,
			cells: variationCells,
			childrenSearchCount: item.childrenSearchCount,
			parentSearchTerm: item?.parentSearchTerm,
		};
	}, [expanded, item.childrenSearchCount, item?.parentSearchTerm]);

	/**
	 *
	 */
	// const animatedStyle = useAnimatedStyle(() => {
	// 	return {
	// 		height: withTiming(
	// 			expanded ? 500 : 100,
	// 			{
	// 				duration: 500,
	// 				easing: Easing.out(Easing.exp),
	// 			},
	// 			() => {}
	// 		),
	// 	};
	// });

	/**
	 *
	 */
	return (
		<VariationTableContext.Provider value={variationTableContext}>
			<Table.Row item={item} index={index} cellRenderer={cellRenderer} />
			{expanded && (
				// <Animated.View style={animatedStyle}>
				<ErrorBoundary>
					<Variations
						item={item}
						initialSelectedAttributes={initialSelectedAttributes}
						parentSearchTerm={item?.parentSearchTerm}
					/>
				</ErrorBoundary>
				// </Animated.View>
			)}
		</VariationTableContext.Provider>
	);
};

export default VariableProductTableRow;
