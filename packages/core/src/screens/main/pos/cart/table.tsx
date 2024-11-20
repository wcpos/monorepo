import * as React from 'react';
import { ScrollView, View } from 'react-native';

import {
	Column,
	ColumnDef,
	useReactTable,
	getCoreRowModel,
	flexRender,
} from '@tanstack/react-table';
import find from 'lodash/find';
import get from 'lodash/get';
import isEqual from 'lodash/isEqual';
import { useObservableEagerState } from 'observable-hooks';

import { ErrorBoundary } from '@wcpos/components/src/error-boundary';
import { cn, getFlexAlign } from '@wcpos/components/src/lib/utils';
import { Suspense } from '@wcpos/components/src/suspense';
import {
	Table,
	TableHeader,
	TableRow,
	TableHead,
	TableBody,
	TableCell,
	PulseTableRow,
} from '@wcpos/components/src/table';
import { Text } from '@wcpos/components/src/text';

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
import EmptyTableRow from '../../components/empty-table-row';
import { useUISettings } from '../../contexts/ui-settings';
import { useCurrentOrder } from '../contexts/current-order';
import { useCartLines } from '../hooks/use-cart-lines';
import { getUuidFromLineItem } from '../hooks/utils';
import { SKU } from './cells/sku';

type LineItem = import('@wcpos/database').OrderDocument['line_items'][number];
type FeeLine = import('@wcpos/database').OrderDocument['fee_lines'][number];
type ShippingLine = import('@wcpos/database').OrderDocument['shipping_lines'][number];
type OrderDocument = import('@wcpos/database').OrderDocument;

const cells = {
	line_items: {
		actions: Actions,
		name: ProductName,
		price: Price,
		regular_price: RegularPrice,
		quantity: Quantity,
		subtotal: Subtotal,
		total: ProductTotal,
		sku: SKU,
	},
	fee_lines: {
		actions: Actions,
		name: FeeName,
		price: FeePrice,
		quantity: () => null,
		subtotal: () => null,
		total: FeeAndShippingTotal,
		sku: () => null,
	},
	shipping_lines: {
		actions: Actions,
		name: ShippingTitle,
		price: ShippingPrice,
		quantity: () => null,
		subtotal: () => null,
		total: FeeAndShippingTotal,
		sku: () => null,
	},
};

/**
 *
 */
const formatCartItems = (
	items: LineItem[] | FeeLine[] | ShippingLine[],
	type: 'line_items' | 'fee_lines' | 'shipping_lines'
) => {
	return items.map((item) => {
		const uuid = getUuidFromLineItem(item);

		return {
			item,
			uuid,
			type,
		};
	});
};

/**
 *
 */
export const CartTable = () => {
	const { uiSettings, getUILabel } = useUISettings('pos-cart');
	const uiColumns = useObservableEagerState(uiSettings.columns$);
	const { line_items, fee_lines, shipping_lines } = useCartLines();
	const rowRefs = React.useRef<Map<string, React.RefObject<View>>>(new Map());
	const scrollViewRef = React.useRef<ScrollView>(null);
	const { currentOrder } = useCurrentOrder();

	// Track previous cart data
	const prevDataRef = React.useRef<CartLine[]>([]);
	const prevOrderRef = React.useRef<OrderDocument>(null);
	const currentOrderRef = React.useRef<OrderDocument>(null);
	currentOrderRef.current = currentOrder;

	/**
	 * Flatten line items, fee lines and shipping lines into a single array.
	 */
	const data = React.useMemo(() => {
		const flattenedArray = [
			...formatCartItems(line_items, 'line_items'),
			...formatCartItems(fee_lines, 'fee_lines'),
			...formatCartItems(shipping_lines, 'shipping_lines'),
		];
		return flattenedArray;
	}, [line_items, fee_lines, shipping_lines]);

	/**
	 * Compute new UUIDs whenever `data` or `currentOrder.uuid` changes.
	 */
	const newRowUUIDs = React.useMemo(() => {
		if (!currentOrderRef?.current.uuid) {
			return [];
		}

		if (currentOrderRef.current.uuid !== prevOrderRef?.current?.uuid) {
			prevOrderRef.current = currentOrderRef.current;
			prevDataRef.current = data;
			return [];
		}

		const detectedNewUUIDs = data.reduce<string[]>((acc, newItem) => {
			const prevItem = prevDataRef.current.find((prevItem) => prevItem.uuid === newItem.uuid);

			if (!prevItem) {
				acc.push(newItem.uuid);
			} else if (
				newItem.type === 'line_items' &&
				newItem.item.quantity !== prevItem.item.quantity
			) {
				acc.push(newItem.uuid);
			}

			return acc;
		}, []);

		if (detectedNewUUIDs.length > 0) {
			prevDataRef.current = data;
		}

		return detectedNewUUIDs;
	}, [data]);

	/**
	 *
	 */
	const columns: ColumnDef<CartLine>[] = React.useMemo(() => {
		return uiColumns
			.filter((column) => column.show)
			.map((col) => {
				return {
					accessorKey: col.key,
					header: ({ column }) => (
						<Text className={'font-medium text-muted-foreground'} numberOfLines={1}>
							{getUILabel(column.id)}
						</Text>
					),
					// size: column.size,
					cell: (props) => {
						const Cell = get(cells, [props.row.original.type, props.column.id]);
						if (Cell) {
							return (
								<ErrorBoundary>
									<Cell {...props} />
								</ErrorBoundary>
							);
						}

						return null;
					},
					meta: {
						...col,
						show: (key: string) => {
							const d = find(col.display, { key });
							return !!(d && d.show);
						},
					},
				};
			});
	}, [uiColumns, getUILabel]);

	/**
	 *
	 */
	const table = useReactTable({
		data,
		columns,
		getCoreRowModel: getCoreRowModel(),
		getRowId: (line) => line.uuid,
		// debugTable: true,
		meta: {
			onChange: (data: any) => {
				console.log('onChange called without handler', data);
			},
			rowRefs,
			newRowUUIDs,
			scrollToRow: (uuid: string) => {
				const rowRef = rowRefs.current.get(uuid);
				const scrollView = scrollViewRef.current;

				if (rowRef && scrollView) {
					rowRef.measureLayout(
						scrollView,
						(x, y, width, height) => {
							scrollView.measure((scrollX, scrollY, scrollWidth, scrollHeight) => {
								const isRowAboveView = y < scrollY;
								const isRowBelowView = y + height > scrollY + scrollHeight;

								if (isRowAboveView || isRowBelowView) {
									scrollView.scrollTo({ y, animated: true });
								}
							});
						},
						(error) => {
							console.error('Measure layout failed', error);
						}
					);
				}
			},
		},
	});

	/**
	 *
	 */
	return (
		<Table aria-labelledby="cart-table" className="h-full">
			<TableHeader>
				{table.getHeaderGroups().map((headerGroup) => {
					return (
						<TableRow key={headerGroup.id}>
							{headerGroup.headers.map((header) => {
								const meta = header.column.columnDef.meta;

								return (
									<TableHead
										key={header.id}
										style={{
											flexGrow: meta?.width ? 0 : meta?.flex ? meta.flex : 1,
											flexBasis: meta?.width ? meta.width : undefined,
											alignItems: getFlexAlign(meta?.align || 'left'),
										}}
									>
										{header.isPlaceholder || meta?.hideLabel
											? null
											: flexRender(header.column.columnDef.header, header.getContext())}
									</TableHead>
								);
							})}
						</TableRow>
					);
				})}
			</TableHeader>
			<ScrollView ref={scrollViewRef}>
				<TableBody>
					{table.getRowModel().rows.map((row, index) => {
						return (
							<PulseTableRow
								ref={(ref) => rowRefs.current.set(row.id, ref)}
								key={row.id}
								index={index}
								table={table}
								row={row}
							>
								{row.getVisibleCells().map((cell) => {
									const meta = cell.column.columnDef.meta;

									return (
										<TableCell
											key={cell.id}
											style={{
												flexGrow: meta?.width ? 0 : meta?.flex ? meta.flex : 1,
												flexBasis: meta?.width ? meta.width : undefined,
												alignItems: getFlexAlign(meta?.align || 'left'),
											}}
										>
											{flexRender(cell.column.columnDef.cell, cell.getContext())}
										</TableCell>
									);
								})}
							</PulseTableRow>
						);
					})}
				</TableBody>
			</ScrollView>
		</Table>
	);
};
