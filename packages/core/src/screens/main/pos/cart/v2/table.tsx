import * as React from 'react';
import { ScrollView, type ScrollViewInstance } from 'react-native';

import {
	columnVisibilityFeature,
	flexRender,
	tableFeatures,
	useTable,
} from '@tanstack/react-table';
import find from 'lodash/find';
import get from 'lodash/get';

import { ErrorBoundary } from '@wcpos/components/error-boundary';
import { cn, getFlexAlign } from '@wcpos/components/lib/utils';
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
import { useIsPhone } from '@wcpos/components/lib/device';
import { useDocField } from '@wcpos/query';

import { useT } from '../../../../../contexts/translations';
import { LineStrip } from './cells/line-strip';
import { type LineSort, sortLines } from './sort-lines';
import { FeeAndShippingTotal } from '../cells/fee-and-shipping-total';
import { FeeName } from './cells/fee-name';
import { FeePrice } from '../cells/fee-price';
import { LineItemImage } from '../cells/image';
import { Price } from './cells/price';
import { ProductName } from './cells/product-name';
import { ProductTotal } from './cells/product-total';
import { Quantity } from './cells/quantity-keypad';
import { RegularPrice } from '../cells/regular_price';
import { ShippingPrice } from '../cells/shipping-price';
import { ShippingTitle } from './cells/shipping-title';
import { Subtotal } from '../cells/subtotal';
import { useUISettings } from '../../../contexts/ui-settings';
import { type CurrentOrderRecord, useCurrentOrder } from '../../contexts/current-order';
import { useCartLines } from '../../hooks/use-cart-lines';
import { CartLine, detectNewCartLines, getUuidFromLineItem } from '../../hooks/utils';
import { SKU } from '../cells/sku';

import type { Column, ColumnDef } from '../../../../../table-types';
const cartTableFeatures = tableFeatures({ columnVisibilityFeature });
/**
 * Item gives way (the decided cart board: `44px 1fr 70px 80px`). The amount columns hold a
 * width and the name takes what is left, so a total never wraps onto two lines. Spacing
 * utilities, so the widths follow the scale step. Quantity and the prices are inputs and
 * take a fixed width; the totals are text with a floor, and a long total widens its own
 * cell rather than wrapping. The header holds the floor and truncates its label. The
 * inner paddings are the board's 12 px gap, so the name keeps room at the largest step.
 */
const INPUT_COLUMN = { head: 'w-18 flex-none px-2', cell: 'w-18 flex-none px-2' };
const TEXT_COLUMN = { head: 'w-20 flex-none pr-3 pl-2', cell: 'min-w-20 flex-none pr-3 pl-2' };
const AMOUNT_COLUMNS: Record<string, { head: string; cell: string } | undefined> = {
	quantity: { head: 'w-12 flex-none pr-2 pl-3', cell: 'w-12 flex-none pr-2 pl-3' },
	price: INPUT_COLUMN,
	regular_price: INPUT_COLUMN,
	subtotal: TEXT_COLUMN,
	total: TEXT_COLUMN,
};
/**
 * Under this cart width the Price column folds away. With it, the item name is left about
 * 50 px at 273 (a 768-wide tablet: "Affirm Wat…", "Beani / e wi…") and about 100 px at 300,
 * where a two-word name reads. Shot on the real register, 2026-10-02.
 */
const PRICE_COLUMN_MIN_WIDTH = 300;
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
	position: number;
	kind: 'line' | 'fee' | 'shipping';
	name: string;
	total: number;
	/** Per-unit price for the Price sort; fees and shipping carry their total (they sort last anyway). */
	price: number;
}
const cells = {
	line_items: {
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
		image: () => null,
		name: FeeName,
		price: FeePrice,
		quantity: () => null,
		subtotal: () => null,
		total: FeeAndShippingTotal,
		sku: () => null,
	},
	shipping_lines: {
		image: () => null,
		name: ShippingTitle,
		price: ShippingPrice,
		quantity: () => null,
		subtotal: () => null,
		total: FeeAndShippingTotal,
		sku: () => null,
	},
};
const formatCartItems = (
	items: LineItem[] | FeeLine[] | ShippingLine[],
	type: 'line_items' | 'fee_lines' | 'shipping_lines'
): CartTableLine[] => {
	return items.map((item, position) => {
		const uuid = getUuidFromLineItem(item) ?? '';
		return {
			item,
			position,
			kind: type === 'line_items' ? 'line' : type === 'fee_lines' ? 'fee' : 'shipping',
			name: ('name' in item ? item.name : 'method_title' in item ? item.method_title : '') ?? '',
			total: Number(item.total ?? 0),
			price: Number(('price' in item ? item.price : item.total) ?? 0),
			uuid,
			type,
		};
	});
};
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
	const t = useT();
	// The decided cart line at phone width has no Price column (the cart board, 2026-09-17):
	// Qty · Item · Total fit; four columns truncate their labels at the larger scale steps.
	// The same goes for a narrow cart column beside the products (a tablet standing up, or the
	// split dragged over): the column's own width decides, not the window's.
	const [narrow, setNarrow] = React.useState(false);
	const isPhone = useIsPhone() || narrow;
	const uiColumns = useDocField(uiSettings, (value) => value.columns);
	const setting = useDocField(uiSettings, (value) => value.sortLines) as LineSort | undefined;
	const { line_items, fee_lines, shipping_lines } = useCartLines();
	const rowRefs = React.useRef<Map<string, PulseTableRowRef | null>>(new Map());
	const rowLayouts = React.useRef<Map<string, { y: number; height: number }>>(new Map());
	const scrollViewRef = React.useRef<ScrollViewInstance>(null);
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
		return sortLines(flattenedArray, setting ?? 'newest_bottom');
	}, [line_items, fee_lines, shipping_lines, setting]);
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
	const columns = React.useMemo((): ColumnDef<CartTableLine, unknown, CartTableFeatures>[] => {
		return uiColumns
			.filter(
				(column) => column.show && column.key !== 'actions' && !(isPhone && column.key === 'price')
			)
			.map((col) => {
				return {
					id: col.key,
					header: ({ column }: { column: Column<CartTableLine, unknown, CartTableFeatures> }) => (
						<Text
							className={'text-muted-foreground text-xs tracking-wide uppercase'}
							numberOfLines={1}
						>
							{{
								quantity: t('pos_cart.col_qty'),
								name: t('pos_cart.col_item'),
								price: t('pos_cart.col_price'),
								total: t('pos_cart.col_total'),
							}[column.id] ?? getUILabel(column.id)}
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
	}, [uiColumns, getUILabel, t, isPhone]);
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
	return (
		<Table
			aria-labelledby="cart-table"
			className="h-full"
			onLayout={({ nativeEvent }) => setNarrow(nativeEvent.layout.width < PRICE_COLUMN_MIN_WIDTH)}
		>
			{process.env.EXPO_PUBLIC_WCPOS_E2E === '1' &&
				React.createElement(
					// Measurement tooling must stay outside ordinary application bundles (ledger 16).

					(
						require('../../../../../../e2e/cart-add-timing-readout') as typeof import('../../../../../../e2e/cart-add-timing-readout')
					).CartAddTimingCommit,
					{ orderId: currentOrderRecord.uuid, lines: line_items }
				)}
			<TableHeader className="border-border border-b">
				{table.getHeaderGroups().map((group) => (
					<TableRow key={group.id} className="min-h-row">
						{group.headers.map((header) => {
							const meta = header.column.columnDef.meta;
							return (
								<TableHead
									key={header.id}
									className={cn('min-h-row', AMOUNT_COLUMNS[header.column.id]?.head)}
									style={
										AMOUNT_COLUMNS[header.column.id]
											? { alignItems: getFlexAlign(meta?.align || 'left') }
											: {
													flexGrow: meta?.width ? 0 : meta?.flex ? meta.flex : 1,
													flexBasis: meta?.width ? meta.width : undefined,
													flexShrink: header.column.id === 'name' ? 1 : 0,
													alignItems: getFlexAlign(meta?.align || 'left'),
												}
									}
								>
									{header.isPlaceholder || meta?.hideLabel
										? null
										: flexRender(header.column.columnDef.header, header.getContext())}
								</TableHead>
							);
						})}
					</TableRow>
				))}
			</TableHeader>
			<ScrollView ref={scrollViewRef} testID="cart-table-scroll">
				<TableBody>
					{table.getRowModel().rows.map((row, index) => (
						<PulseTableRow
							key={row.id}
							ref={(ref) => {
								rowRefs.current.set(row.id, ref);
							}}
							index={index}
							table={table}
							row={row}
							className="bg-card border-border min-h-row border-b"
							onLayout={(e) => {
								const { y, height } = e.nativeEvent.layout;
								rowLayouts.current.set(row.id, { y, height });
							}}
						>
							<LineStrip line={row.original} rowRefs={rowRefs}>
								{(wrapTotal) => {
									const visible = row.getVisibleCells();
									// The strip's press target is the Total cell; with Total hidden in the
									// settings it is the last visible cell, so Edit and Remove stay reachable.
									const targetId = visible.some((cell) => cell.column.id === 'total')
										? 'total'
										: visible.at(-1)?.column.id;
									return visible.map((cell) => {
										const meta = cell.column.columnDef.meta;
										const content = flexRender(cell.column.columnDef.cell, cell.getContext());
										return (
											<TableCell
												key={cell.id}
												className={AMOUNT_COLUMNS[cell.column.id]?.cell}
												style={
													AMOUNT_COLUMNS[cell.column.id]
														? { alignItems: getFlexAlign(meta?.align || 'left') }
														: {
																flexGrow: meta?.width ? 0 : meta?.flex ? meta.flex : 1,
																flexBasis: meta?.width ? meta.width : undefined,
																flexShrink: cell.column.id === 'name' ? 1 : 0,
																alignItems: getFlexAlign(meta?.align || 'left'),
															}
												}
											>
												{cell.column.id === targetId ? wrapTotal(content) : content}
											</TableCell>
										);
									});
								}}
							</LineStrip>
						</PulseTableRow>
					))}
				</TableBody>
			</ScrollView>
		</Table>
	);
}
