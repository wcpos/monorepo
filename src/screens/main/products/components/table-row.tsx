import * as React from 'react';

import get from 'lodash/get';

import ErrorBoundary from '@wcpos/components/src/error-boundary';
import Table, { CellRenderer } from '@wcpos/components/src/table';
import Text from '@wcpos/components/src/text';

import Actions from './cells/actions';
import Barcode from './cells/barcode';
import { LoadingVariablePrice } from './cells/loading-variable-price';
import Name from './cells/name';
import Price from './cells/price';
import RegularPrice from './cells/regular-price';
import SalePrice from './cells/sale-price';
import StockQuanity from './cells/stock-quantity';
import VariablePrice from './cells/variable-price';
import VariableRegularPrice from './cells/variable-regular-price';
import VariableSalePrice from './cells/variable-sale-price';
import DateCreated from '../../components/date';
import Categories from '../../components/product/categories';
import { ProductImage } from '../../components/product/image';
import Tags from '../../components/product/tags';
import { VariationsProvider } from '../../contexts/variations';

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
		regular_price: RegularPrice,
		sale_price: SalePrice,
		date_created: DateCreated,
		date_modified: DateCreated,
		stock_quantity: StockQuanity,
		tags: Tags,
	},
	variable: {
		price: VariablePrice,
		regular_price: VariableRegularPrice,
		sale_price: VariableSalePrice,
	},
	variableLoading: {
		price: LoadingVariablePrice,
		regular_price: LoadingVariablePrice,
		sale_price: LoadingVariablePrice,
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
