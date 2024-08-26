import * as React from 'react';
import { ScrollView } from 'react-native';

import {
	Column,
	ColumnDef,
	useReactTable,
	getCoreRowModel,
	flexRender,
} from '@tanstack/react-table';
import find from 'lodash/find';
import get from 'lodash/get';
import { useObservableEagerState, useObservableRef, useSubscription } from 'observable-hooks';
import { skip, debounceTime } from 'rxjs/operators';

import { ErrorBoundary } from '@wcpos/components/src/error-boundary';
import { cn } from '@wcpos/components/src/lib/utils';
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
export const CartTable = () => {
	const { uiSettings, getUILabel } = useUISettings('pos-cart');
	const uiColumns = useObservableEagerState(uiSettings.columns$);
	const { line_items, fee_lines, shipping_lines } = useCartLines();
	const rowRefs = React.useRef<Map<string, React.RefObject<View>>>(new Map());

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
	const data: CartLine[] = React.useMemo(() => {
		return [
			...mapItems(line_items, 'line_items'),
			...mapItems(fee_lines, 'fee_lines'),
			...mapItems(shipping_lines, 'shipping_lines'),
		];
	}, [mapItems, line_items, fee_lines, shipping_lines]);

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
						<Text className={'font-medium text-muted-foreground'}>{getUILabel(column.id)}</Text>
					),
					// size: column.size,
					cell: (props) => {
						const Cell = get(cells, [props.row.original.type, props.column.id]);
						if (Cell) {
							return (
								<ErrorBoundary>
									<Suspense>
										<Cell {...props} />
									</Suspense>
								</ErrorBoundary>
							);
						}

						return <TextCell {...props} />;
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
		getRowId: (row: CartLine) => row.uuid,
		debugTable: true,
		meta: {
			onChange: (data: any) => {
				console.log('onChange called without handler', data);
			},
			rowRefs,
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
										className={cn(
											meta?.flex && `flex-${meta.flex}`,
											meta?.width && 'flex-none',
											meta?.align && `text-${meta.flex}`
										)}
										style={{ width: meta?.width ? meta.width : undefined }}
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
			<ScrollView>
				<TableBody>
					{table.getRowModel().rows.map((row, index) => {
						return (
							<PulseTableRow
								ref={(ref) => rowRefs.current.set(row.id, ref)}
								key={row.id}
								className={cn(
									'active:opacity-70',
									index % 2 && 'bg-zinc-100/50 dark:bg-zinc-900/50'
								)}
							>
								{row.getVisibleCells().map((cell) => {
									const meta = cell.column.columnDef.meta;

									return (
										<TableCell
											key={cell.id}
											className={cn(
												meta?.flex && `flex-${meta.flex}`,
												meta?.width && 'flex-none'
												// meta?.align && getTailwindJustifyClass(meta.align)
											)}
											style={{ width: meta?.width ? meta.width : undefined }}
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
