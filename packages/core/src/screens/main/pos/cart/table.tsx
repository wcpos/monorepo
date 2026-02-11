import * as React from 'react';
import { ScrollView, View } from 'react-native';

import { ColumnDef, flexRender, getCoreRowModel, useReactTable } from '@tanstack/react-table';
import find from 'lodash/find';
import get from 'lodash/get';
import { useObservableEagerState } from 'observable-hooks';

import { ErrorBoundary } from '@wcpos/components/error-boundary';
import { getFlexAlign } from '@wcpos/components/lib/utils';
import {
	PulseTableRow,
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from '@wcpos/components/table';
import { Text } from '@wcpos/components/text';

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
import { useUISettings } from '../../contexts/ui-settings';
import { useCurrentOrder } from '../contexts/current-order';
import { useCartLines } from '../hooks/use-cart-lines';
import { CartLine, getUuidFromLineItem } from '../hooks/utils';
import { SKU } from './cells/sku';

type LineItem = NonNullable<import('@wcpos/database').OrderDocument['line_items']>[number];
type FeeLine = NonNullable<import('@wcpos/database').OrderDocument['fee_lines']>[number];
type ShippingLine = NonNullable<import('@wcpos/database').OrderDocument['shipping_lines']>[number];
type OrderDocument = import('@wcpos/database').OrderDocument;

/**
 * CartTableLine wraps a CartLine (LineItem | FeeLine | ShippingLine) with display metadata.
 */
interface CartTableLine {
	item: CartLine;
	uuid: string;
	type: 'line_items' | 'fee_lines' | 'shipping_lines';
}

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
): CartTableLine[] => {
	return items.map((item) => {
		const uuid = getUuidFromLineItem(item) ?? '';

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
export function CartTable() {
	const { uiSettings, getUILabel } = useUISettings('pos-cart');
	const uiColumns = useObservableEagerState(uiSettings.columns$);
	const { line_items, fee_lines, shipping_lines } = useCartLines();
	const rowRefs = React.useRef<Map<string, React.RefObject<View>>>(new Map());
	const rowLayouts = React.useRef<Map<string, { y: number; height: number }>>(new Map());
	const scrollViewRef = React.useRef<ScrollView>(null);
	const { currentOrder } = useCurrentOrder();

	// Track previous cart data
	const prevDataRef = React.useRef<CartTableLine[]>([]);
	const prevOrderRef = React.useRef<OrderDocument | null>(null);
	const currentOrderRef = React.useRef<OrderDocument | null>(null);
	currentOrderRef.current = currentOrder;

	/**
	 * Flatten line items, fee lines and shipping lines into a single array.
	 */
	const data: CartTableLine[] = React.useMemo(() => {
		const flattenedArray = [
			...formatCartItems(line_items, 'line_items'),
			...formatCartItems(fee_lines, 'fee_lines'),
			...formatCartItems(shipping_lines, 'shipping_lines'),
		];
		return flattenedArray;
	}, [line_items, fee_lines, shipping_lines]);

	/**
	 * Track new row UUIDs as state so they can be removed without prop mutation.
	 */
	const [newRowUUIDs, setNewRowUUIDs] = React.useState<string[]>([]);

	React.useEffect(() => {
		if (!currentOrderRef.current?.uuid) {
			setNewRowUUIDs([]);
			return;
		}

		if (currentOrderRef.current.uuid !== prevOrderRef.current?.uuid) {
			prevOrderRef.current = currentOrderRef.current;
			prevDataRef.current = data;
			setNewRowUUIDs([]);
			return;
		}

		const detectedNewUUIDs = data.reduce<string[]>((acc, newItem) => {
			const prevItem = prevDataRef.current.find((prevItem) => prevItem.uuid === newItem.uuid);

			if (!prevItem) {
				acc.push(newItem.uuid);
			} else if (
				newItem.type === 'line_items' &&
				(newItem.item as LineItem).quantity !== (prevItem.item as LineItem).quantity
			) {
				acc.push(newItem.uuid);
			}

			return acc;
		}, []);

		if (detectedNewUUIDs.length > 0) {
			prevDataRef.current = data;
			setNewRowUUIDs(detectedNewUUIDs);
		}
	}, [data]);

	const removeNewRowUUID = React.useCallback((uuid: string) => {
		setNewRowUUIDs((prev) => prev.filter((id) => id !== uuid));
	}, []);

	/**
	 *
	 */
	const columns = React.useMemo((): ColumnDef<CartTableLine>[] => {
		return uiColumns
			.filter((column) => column.show)
			.map((col) => {
				return {
					id: col.key,
					header: ({
						column,
					}: {
						column: import('@tanstack/react-table').Column<CartTableLine, unknown>;
					}) => (
						<Text className={'text-muted-foreground font-medium'} numberOfLines={1}>
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
				} as ColumnDef<CartTableLine>;
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
			onChange: (_data: unknown) => {
				// fallback handler — should be overridden by the parent
			},
			rowRefs,
			newRowUUIDs,
			removeNewRowUUID,
			rowLayouts,
			scrollToRow: (uuid: string) => {
				const layout = rowLayouts.current.get(uuid);
				const scrollView = scrollViewRef.current;

				if (layout && scrollView) {
					scrollView.scrollTo({ y: layout.y, animated: true });
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
								ref={(ref) => {
									rowRefs.current.set(row.id, ref as unknown as React.RefObject<View>);
								}}
								key={row.id}
								index={index}
								table={table}
								row={row}
								onLayout={(e) => {
									const { y, height } = e.nativeEvent.layout;
									rowLayouts.current.set(row.id, { y, height });
								}}
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
}
