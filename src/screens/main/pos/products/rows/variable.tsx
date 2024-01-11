import * as React from 'react';

import get from 'lodash/get';
// import { useObservableState } from 'observable-hooks';

import ErrorBoundary from '@wcpos/components/src/error-boundary';
import Suspense from '@wcpos/components/src/suspense';
import Table, { CellRenderer } from '@wcpos/components/src/table';
import Text from '@wcpos/components/src/text';

import { ProductImage } from '../../../components/product/image';
import VariablePrice from '../../../components/product/variable-price';
import Variations from '../../../components/product/variation-table-rows';
import { VariationTableContext } from '../../../components/product/variation-table-rows/context';
import { Name } from '../cells/name';
import { Price } from '../cells/price';
import { SKU } from '../cells/sku';
import { StockQuantity } from '../cells/stock-quantity';
import VariableActions from '../cells/variable-actions';
import { ProductVariationActions } from '../cells/variation-actions';

import type { ListRenderItemInfo } from '@shopify/flash-list';
type ProductDocument = import('@wcpos/database').ProductDocument;

const cells = {
	actions: VariableActions,
	image: ProductImage,
	name: Name,
	price: VariablePrice,
	stock_quantity: StockQuantity,
	sku: SKU,
};

const variationCells = {
	actions: ProductVariationActions,
	stock_quantity: StockQuantity,
	price: Price,
	sku: SKU,
};

/**
 *
 */
const VariableProductTableRow = ({ item, index }: ListRenderItemInfo<ProductDocument>) => {
	// const variationIDs = useObservableState(item.variations$, item.variations);
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

	/**
	 * Create a new query for variations on:
	 * - change to variationIDs
	 * - change to expanded
	 *
	 * @TODO - sync sorting with parent product
	 * @TODO - fix hack for attribute click
	 */
	const variationTableContext = React.useMemo(() => {
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
