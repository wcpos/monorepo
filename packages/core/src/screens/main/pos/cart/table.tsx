import * as React from 'react';
import { ScrollView } from 'react-native';

import {
	columnVisibilityFeature,
	flexRender,
	tableFeatures,
	useTable,
} from '@tanstack/react-table';
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
import type { PulseTableRowRef } from '@wcpos/components/table';
import { Text } from '@wcpos/components/text';

import { Actions } from './cells/actions';
import { FeeAndShippingTotal } from './cells/fee-and-shipping-total';
import { FeeName } from './cells/fee-name';
import { FeePrice } from './cells/fee-price';
import { LineItemImage } from './cells/image';
import { Price } from './cells/price';
import { ProductName } from './cells/product-name';
import { ProductTotal } from './cells/product-total';
import { Quantity } from './cells/quantity';
import { RegularPrice } from './cells/regular_price';
import { ShippingPrice } from './cells/shipping-price';
import { ShippingTitle } from './cells/shipping-title';
import { Subtotal } from './cells/subtotal';
import { useUISettings } from '../../contexts/ui-settings';
import { type CurrentOrderRecord, useCurrentOrder } from '../contexts/current-order';
import { useCartLines } from '../hooks/use-cart-lines';
import { CartLine, detectNewCartLines, getUuidFromLineItem } from '../hooks/utils';
import { SKU } from './cells/sku';

import type { Column, ColumnDef } from '../../../../table-types';

const cartTableFeatures = tableFeatures({ columnVisibilityFeature });

type CartTableFeatures = typeof cartTableFeatures;

type LineItem = NonNullable<import('@wcpos/database').OrderDocument['line_items']>[number];
type FeeLine = NonNullable<import('@wcpos/database').OrderDocument['fee_lines']>[number];
type ShippingLine = NonNullable<import('@wcpos/database').OrderDocument['shipping_lines']>[number];

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
		image: LineItemImage,
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
		image: () => null,
		name: FeeName,
		price: FeePrice,
		quantity: () => null,
		subtotal: () => null,
		total: FeeAndShippingTotal,
		sku: () => null,
	},
	shipping_lines: {
		actions: Actions,
		image: () => null,
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
interface CartTableProps {
	/**
	 * Set by OpenOrders while the current order is still an unsaved draft. If
	 * this table mounts for the order that draft became (same uuid), its
	 * initial rows are a first add and deserve a pulse; on a plain mount for an
	 * existing order they are baseline data.
	 */
	lastDraftOrderUuidRef?: React.RefObject<string | undefined>;
}

export function CartTable({ lastDraftOrderUuidRef }: CartTableProps) {
	const { uiSettings, getUILabel } = useUISettings('pos-cart');
	const uiColumns = useObservableEagerState(uiSettings.columns$);
	const { line_items, fee_lines, shipping_lines } = useCartLines();
	const rowRefs = React.useRef<Map<string, PulseTableRowRef | null>>(new Map());
	const rowLayouts = React.useRef<Map<string, { y: number; height: number }>>(new Map());
	const scrollViewRef = React.useRef<ScrollView>(null);
	const { currentOrderRecord } = useCurrentOrder();

	// Track previous cart data
	const prevDataRef = React.useRef<CartTableLine[]>([]);
	const prevOrderRef = React.useRef<CurrentOrderRecord | null>(null);
	const currentOrderRef = React.useRef<CurrentOrderRecord | null>(null);

	/**
	 * Latest-value ref for the effect below, which must react to `data` alone and
	 * so cannot take `currentOrderRecord` as a dependency.
	 *
	 * This used to be a bare `currentOrderRef.current = currentOrderRecord` during
	 * render. That was invisible to the React Compiler while react-table v8 made
	 * it skip this component wholesale ("Compilation Skipped: Use of incompatible
	 * library"); v9 is compiler-compatible, so the component is compiled now and
	 * a render-phase ref write is an error. Declared BEFORE the consuming effect,
	 * this runs first in the same commit, so the value it reads is identical to
	 * what the render-phase assignment produced.
	 */
	React.useEffect(() => {
		currentOrderRef.current = currentOrderRecord;
	});

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
	 * Pulse rows green when a line is added or its quantity changes.
	 *
	 * The pulse is triggered imperatively from this effect (row refs are
	 * attached before effects run, so a row added in this commit is already in
	 * rowRefs). Routing it through state/meta instead re-ran a consumer effect
	 * on every cart re-render (totals recalcs), restarting the animation
	 * several times per add and making it stutter.
	 */
	React.useEffect(() => {
		if (!currentOrderRef.current?.uuid) {
			return;
		}

		if (currentOrderRef.current.uuid !== prevOrderRef.current?.uuid) {
			prevOrderRef.current = currentOrderRef.current;
			if (lastDraftOrderUuidRef?.current === currentOrderRef.current.uuid) {
				// This order was the empty draft a moment ago: the rows it mounted
				// with ARE the first add, so diff them against an empty baseline.
				// (OpenOrders clears the ref after this commit — parent effects run
				// after child effects — so a later remount can't re-pulse.)
				prevDataRef.current = [];
			} else {
				// Switched to a different existing order — baseline, don't pulse.
				prevDataRef.current = data;
				return;
			}
		}

		const detectedNewUUIDs = detectNewCartLines(prevDataRef.current, data);
		prevDataRef.current = data;

		if (detectedNewUUIDs.length > 0) {
			for (const uuid of detectedNewUUIDs) {
				rowRefs.current.get(uuid)?.pulseAdd();
			}
		}
	}, [data, lastDraftOrderUuidRef]);

	/**
	 *
	 */
	const columns = React.useMemo((): ColumnDef<CartTableLine, unknown, CartTableFeatures>[] => {
		return uiColumns
			.filter((column) => column.show)
			.map((col) => {
				return {
					id: col.key,
					header: ({ column }: { column: Column<CartTableLine, unknown, CartTableFeatures> }) => (
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
				} as ColumnDef<CartTableLine, unknown, CartTableFeatures>;
			});
	}, [uiColumns, getUILabel]);

	/**
	 *
	 */
	const table = useTable({
		features: cartTableFeatures,
		data,
		columns,
		getRowId: (line) => line.uuid,
		// debugTable: true,
		meta: {
			onChange: (_data: unknown) => {
				// fallback handler — should be overridden by the parent
			},
			rowRefs,
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
									rowRefs.current.set(row.id, ref);
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
