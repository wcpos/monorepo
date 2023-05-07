import * as React from 'react';

import get from 'lodash/get';

import ErrorBoundary from '@wcpos/components/src/error-boundary';
import Table, { CellRenderer } from '@wcpos/components/src/table';
import Text from '@wcpos/components/src/text';

import { Actions } from './cells/actions';
import { LoadingVariableActions } from './cells/loading-variations-action';
import { LoadingVariablePrice } from './cells/loading-variations-price';
import { Name } from './cells/name';
import { Price } from './cells/price';
import { SKU } from './cells/sku';
import { StockQuantity } from './cells/stock-quantity';
import { VariableActions } from './cells/variable-actions';
import { VariablePrice } from './cells/variable-price';
import { ProductImage } from '../../components/product/image';
import { VariationsProvider } from '../../contexts/variations';

import type { ListRenderItemInfo } from '@shopify/flash-list';
type ProductDocument = import('@wcpos/database').ProductDocument;

const cells = {
	simple: {
		actions: Actions,
		image: ProductImage,
		name: Name,
		price: Price,
		sku: SKU,
		stock_quantity: StockQuantity,
	},
	variable: {
		actions: VariableActions,
		image: ProductImage,
		name: Name,
		price: VariablePrice,
		sku: SKU,
		stock_quantity: StockQuantity,
	},
	variableLoading: {
		actions: LoadingVariableActions,
		image: ProductImage,
		name: Name,
		price: LoadingVariablePrice,
		sku: SKU,
		stock_quantity: StockQuantity,
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
	/**
	 *
	 */
	const simpleProductCellRenderer = React.useCallback<CellRenderer<ProductDocument>>(
		({ item, column, index }) => {
			const Cell = get(cells, [item.type, column.key], cells.simple[column.key]);

			if (Cell) {
				return (
					<ErrorBoundary>
						<React.Suspense>
							<Cell item={item} column={column} index={index} />
						</React.Suspense>
					</ErrorBoundary>
				);
			}

			if (item[column.key]) {
				return <Text>{String(item[column.key])}</Text>;
			}

			return null;
		},
		[]
	);

	/**
	 *
	 */
	const loadingVariationCellRenderer = React.useCallback<CellRenderer<ProductDocument>>(
		({ item, column, index }) => {
			const Cell = get(cells, ['variableLoading', column.key], cells.simple[column.key]);

			if (Cell) {
				return (
					<ErrorBoundary>
						<React.Suspense>
							<Cell item={item} column={column} index={index} />
						</React.Suspense>
					</ErrorBoundary>
				);
			}

			if (item[column.key]) {
				return <Text>{String(item[column.key])}</Text>;
			}

			return null;
		},
		[]
	);

	/**
	 *
	 */
	if (item.type === 'variable' && !extraData.shownItems[item.uuid]) {
		return (
			<Table.Row
				item={item}
				index={index}
				extraData={extraData}
				target={target}
				cellRenderer={loadingVariationCellRenderer}
			/>
		);
	}

	if (item.type === 'variable') {
		return (
			<VariationsProvider parent={item} uiSettings={extraData.uiSettings}>
				<Table.Row
					item={item}
					index={index}
					extraData={extraData}
					target={target}
					cellRenderer={simpleProductCellRenderer}
				/>
			</VariationsProvider>
		);
	}

	return (
		<Table.Row
			item={item}
			index={index}
			extraData={extraData}
			target={target}
			cellRenderer={simpleProductCellRenderer}
		/>
	);
};

export default ProductTableRow;
