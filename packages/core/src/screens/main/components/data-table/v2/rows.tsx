import * as React from 'react';
import { Pressable, type PressableProps, View } from 'react-native';

import { flexRender, type RowData } from '@tanstack/react-table';

import { usePointer } from '@wcpos/components/lib/device';
import { ErrorBoundary } from '@wcpos/components/error-boundary';
import { Suspense } from '@wcpos/components/suspense';
import { TableCell } from '@wcpos/components/table';

import { getColumnStyle } from '../index';

import type { Row } from '../../../../../table-types';
import type { DataTableFeatures } from './index';

export function getRowTestID(item: { id: string; original: unknown }) {
	const record = (item.original as { record?: { payload?: { slug?: string }; uuid?: string } })
		.record;
	// Woo numeric ids can appear after a create ack; the adapter uuid/hit id is stable for the row.
	const stableId = record?.payload?.slug ?? record?.uuid ?? item.id;
	return stableId !== null && stableId !== undefined && stableId !== ''
		? `data-table-row-${stableId}`
		: undefined;
}

export function DataTableRow<TData extends RowData>({
	item,
	onPress,
	testID,
	trailing,
	accessibilityLabel,
}: {
	item: Row<TData, DataTableFeatures>;
	onPress?: PressableProps['onPress'];
	testID?: string;
	trailing?: React.ReactNode;
	/**
	 * Set by a caller whose row IS the control (no trailing button, no controls in its
	 * cells): the row then takes the button role and this name. Callers with controls
	 * inside the cells leave it unset, so no button nests in a button on web.
	 */
	accessibilityLabel?: string;
}) {
	const pointer = usePointer();
	const cells = item.getVisibleCells();
	const content = (cell: (typeof cells)[number]) => (
		<ErrorBoundary key={cell.id}>
			<Suspense>
				{cell.column.id === 'actions' && trailing !== undefined
					? trailing
					: flexRender(cell.column.columnDef.cell, cell.getContext())}
			</Suspense>
		</ErrorBoundary>
	);
	// The actions cell (the caller's trailing control: `+`, a chevron, the in-cart count) sits
	// BESIDE the row's pressable, never inside it: a button inside a button is invalid HTML and
	// React reports it on web. The pressable covers every other cell.
	const actions = cells.find((cell) => cell.column.id === 'actions');
	const body = cells.filter((cell) => cell.column.id !== 'actions');
	const primary = body.filter((cell) => cell.column.id !== 'price');
	const trailingNode = actions ? content(actions) : trailing;
	return (
		<View className="border-border flex-row items-center border-b">
			<Pressable
				testID={testID ?? getRowTestID(item)}
				// No `accessibilityRole="button"` by default: on web that renders a <button>, and the
				// cells may carry their own controls (category chips, an edit icon), which may not
				// nest in one. A caller whose row is the only control names it (`accessibilityLabel`).
				accessibilityRole={accessibilityLabel ? 'button' : undefined}
				accessibilityLabel={accessibilityLabel}
				onPress={
					onPress
						? (event) => {
								// A press that started on a control inside a cell is that control's, not the
								// row's (web bubbles the click; native's responder already stops here).
								const target = (event as unknown as { nativeEvent?: { target?: unknown } })
									.nativeEvent?.target;
								// `Element` exists on web only; Hermes has no DOM, and native's responder
								// system already grants the innermost pressable.
								if (
									typeof Element !== 'undefined' &&
									target instanceof Element &&
									target.closest('button,[role="button"],a,input,select,textarea')
								)
									return;
								onPress(event);
							}
						: undefined
				}
				className={
					pointer === 'fine'
						? 'min-h-row active:bg-muted web:hover:bg-muted flex-1 flex-row items-center'
						: 'min-h-row active:bg-muted flex-1 flex-row items-center gap-3 px-3'
				}
			>
				{pointer === 'fine' ? (
					body.map((cell, index) => (
						<TableCell
							key={cell.id}
							style={getColumnStyle(
								index === body.length - 1 && !actions
									? { ...cell.column.columnDef.meta, width: undefined, flex: 1 }
									: cell.column.columnDef.meta
							)}
						>
							{content(cell)}
						</TableCell>
					))
				) : (
					<>
						<View className="min-w-0 flex-1">{primary.map(content)}</View>
						{body.filter((cell) => cell.column.id === 'price').map(content)}
					</>
				)}
			</Pressable>
			{trailingNode !== undefined && trailingNode !== null ? (
				pointer === 'fine' && actions ? (
					<TableCell style={getColumnStyle(actions.column.columnDef.meta)}>
						{trailingNode}
					</TableCell>
				) : (
					<View className="pr-3">{trailingNode}</View>
				)
			) : null}
		</View>
	);
}
