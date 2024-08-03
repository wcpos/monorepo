import * as React from 'react';
import { ScrollView } from 'react-native';

import get from 'lodash/get';
import { useObservableEagerState } from 'observable-hooks';

import { ErrorBoundary } from '@wcpos/tailwind/src/error-boundary';
import { cn } from '@wcpos/tailwind/src/lib/utils';
import {
	Table,
	TableHeader,
	TableRow,
	TableHead,
	TableBody,
	TableCell,
} from '@wcpos/tailwind/src/table2';
import { Text } from '@wcpos/tailwind/src/text';

import { Actions } from './cells/actions';
import { FeeAndShippingTotal } from './cells/fee-and-shipping-total';
import { FeeName } from './cells/fee-name';
import { FeePrice } from './cells/fee-price';
import { Price } from './cells/price';
import { ProductName } from './cells/product-name';
import { ProductTotal } from './cells/product-total';
import { Quantity } from './cells/quantity';
import { RegularPrice } from './cells/regular_price';
import { ShippingPrice } from './cells/shipping-price';
import { ShippingTitle } from './cells/shipping-title';
import { Subtotal } from './cells/subtotal';
import { useT } from '../../../../contexts/translations';
import EmptyTableRow from '../../components/empty-table-row';
import { TextCell } from '../../components/text-cell';
import { useUISettings } from '../../contexts/ui-settings';
import { useCartLines, CartLine } from '../hooks/use-cart-lines';
import { getUuidFromLineItemMetaData } from '../hooks/utils';

const cells = {
	line_items: {
		actions: Actions,
		name: ProductName,
		price: Price,
		regular_price: RegularPrice,
		quantity: Quantity,
		subtotal: Subtotal,
		total: ProductTotal,
	},
	fee_lines: {
		actions: Actions,
		name: FeeName,
		price: FeePrice,
		quantity: () => null,
		subtotal: () => null,
		total: FeeAndShippingTotal,
	},
	shipping_lines: {
		actions: Actions,
		name: ShippingTitle,
		price: ShippingPrice,
		quantity: () => null,
		subtotal: () => null,
		total: FeeAndShippingTotal,
	},
};

/**
 *
 */
const CartTable = () => {
	const { uiSettings, getUILabel } = useUISettings('pos-cart');
	const uiColumns = useObservableEagerState(uiSettings.columns$);
	const t = useT();
	const { line_items, fee_lines, shipping_lines } = useCartLines();

	/**
	 * @TODO - add sorting?
	 * @NOTE - this a slight different format than the other data tables
	 */
	const mapItems = React.useCallback((items, type) => {
		return items.map((item) => ({
			item,
			uuid: getUuidFromLineItemMetaData(item.meta_data),
			type,
		}));
	}, []);

	/**
	 *
	 */
	const lines = React.useMemo(() => {
		return [
			...mapItems(line_items, 'line_items'),
			...mapItems(fee_lines, 'fee_lines'),
			...mapItems(shipping_lines, 'shipping_lines'),
		];
	}, [mapItems, line_items, fee_lines, shipping_lines]);

	/**
	 *
	 */
	const columns = React.useMemo(() => {
		return uiColumns.filter((column) => column.show);
	}, [uiColumns]);

	/**
	 *
	 */
	return (
		<Table aria-labelledby="cart-table" className="h-full">
			<TableHeader>
				<TableRow>
					{columns.map((column) => {
						return (
							<TableHead
								key={column.key}
								style={{
									flexGrow: column.flex ? column.flex : 1,
									flex: column.width ? '0 0 auto' : undefined,
									width: column.width ? column.width : undefined,
								}}
							>
								<Text>{getUILabel(column.key)}</Text>
							</TableHead>
						);
					})}
				</TableRow>
			</TableHeader>
			<ScrollView>
				<TableBody>
					{lines.map((line) => {
						return (
							<TableRow key={line.uuid}>
								{columns.map((column) => {
									const Cell = get(cells, [line.type, column.key]);
									return (
										<TableCell
											key={column.key}
											style={{
												flexGrow: column.flex ? column.flex : 1,
												flex: column.width ? '0 0 auto' : undefined,
												width: column.width ? column.width : undefined,
											}}
										>
											{Cell ? (
												<ErrorBoundary>
													<Cell
														type={line.type}
														uuid={line.uuid}
														item={line.item}
														column={column}
													/>
												</ErrorBoundary>
											) : (
												<TextCell item={line.item} column={column} />
											)}
										</TableCell>
									);
								})}
							</TableRow>
						);
					})}
				</TableBody>
			</ScrollView>
		</Table>
	);
};

export default CartTable;
