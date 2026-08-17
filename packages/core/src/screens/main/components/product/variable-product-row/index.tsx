import * as React from 'react';
import { ScrollView } from 'react-native';

import { useObservableEagerState } from 'observable-hooks';
import Animated, {
	useAnimatedStyle,
	useDerivedValue,
	useSharedValue,
	withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { map } from 'rxjs/operators';
import { flexRender } from '@tanstack/react-table';

import { ErrorBoundary } from '@wcpos/components/error-boundary';
import { Suspense } from '@wcpos/components/suspense';
import * as VirtualizedList from '@wcpos/components/virtualized-list';
import { TableCell, TableRow } from '@wcpos/components/table';
import type { EngineRecord } from '@wcpos/query';

import { getColumnStyle } from '../../data-table';
import { VariationRowProvider } from './context';
import { Variations } from './variations';

import type { Row, Table } from '@tanstack/react-table';

type ProductDocument = import('@wcpos/database').ProductDocument;
type ProductRow = { document: ProductDocument; record: EngineRecord<'products'> };

const duration = 500;

/**
 *
 */
export function VariableProductRow({
	item,
	index,
	table,
}: {
	item: Row<ProductRow>;
	index: number;
	table: Table<ProductRow>;
}) {
	/**
	 * React Compiler breaks tanstack/react-table: it caches the
	 * item.getVisibleCells() JSX keyed on the Row object, whose identity is
	 * stable across columnVisibility changes, so toggled columns render stale.
	 * https://github.com/facebook/react/issues/33057
	 */
	'use no memo';
	const meta = table.options.meta as
		| {
				expanded$: import('rxjs').Observable<Record<string, boolean>>;
				setRowExpanded?: (rowId: string, expanded: boolean) => void;
				hideOutOfStockVariations?: boolean;
		  }
		| undefined;
	/**
	 * Memoised explicitly. This component carries `'use no memo'` above, so nothing else
	 * would: the inline `.pipe()` built a new observable every render, and
	 * `useObservableEagerState` keys its subscription on observable identity, so every
	 * visible variable-product row resubscribed on every render.
	 */
	const isExpanded$ = React.useMemo(
		() => meta!.expanded$.pipe(map((expanded: Record<string, boolean>) => !!expanded[item.id])),
		[meta, item.id]
	);
	const isExpanded = useObservableEagerState(isExpanded$);

	/**
	 * Animation setup
	 */
	const height = useSharedValue(0);
	const [shouldRender, setShouldRender] = React.useState(isExpanded);

	const derivedHeight = useDerivedValue(() => {
		// Handle mounting when expanding
		if (isExpanded && !shouldRender) {
			scheduleOnRN(setShouldRender, true);
		}

		// Handle height animation
		return withTiming(
			isExpanded ? height.value : 0,
			{
				duration,
			},
			(isFinished) => {
				// Handle unmounting after collapsing
				if (!isExpanded && isFinished) {
					scheduleOnRN(setShouldRender, false);
				}
			}
		);
	}, [isExpanded]);

	const animatedStyle = useAnimatedStyle(() => ({
		height: derivedHeight.value,
		opacity: derivedHeight.value === 0 ? 0 : 1,
	}));

	/**
	 * Get setRowExpanded from table meta to bypass TanStack's buggy updater function
	 */
	const setRowExpanded = meta?.setRowExpanded;

	/**
	 * Render the row and the animated Variations component
	 */
	const stableId = item.original.record.payload.slug ?? item.original.record.remoteId ?? item.id;

	return (
		<VirtualizedList.Item>
			<VariationRowProvider row={item} setRowExpanded={setRowExpanded}>
				<TableRow testID={stableId ? `data-table-row-${stableId}` : undefined} index={index}>
					{item
						.getVisibleCells()
						.map((cell: import('@tanstack/react-table').Cell<ProductRow, unknown>) => {
							return (
								<TableCell key={cell.id} style={getColumnStyle(cell.column.columnDef.meta)}>
									<ErrorBoundary>
										<Suspense>{flexRender(cell.column.columnDef.cell, cell.getContext())}</Suspense>
									</ErrorBoundary>
								</TableCell>
							);
						})}
				</TableRow>
				<Animated.View style={[animatedStyle, { overflow: 'hidden' }]}>
					{/*
					 * This is a workaround to get the height of the Variations component
					 * when it is expanded.
					 *
					 * On native, the Variations will be rendered with height 0. So, we
					 * render the Variations into a ScrollView to let it fill the space.
					 *
					 * Once we have the height, we can animate the show/hide.
					 */}
					<ScrollView
						scrollEnabled={false}
						showsVerticalScrollIndicator={false}
						onContentSizeChange={(_w, h) => {
							height.value = h;
						}}
					>
						{shouldRender ? (
							<Variations row={item} hideOutOfStock={meta?.hideOutOfStockVariations} />
						) : null}
					</ScrollView>
				</Animated.View>
			</VariationRowProvider>
		</VirtualizedList.Item>
	);
}
