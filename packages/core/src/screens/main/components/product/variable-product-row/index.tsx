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

import * as VirtualizedList from '@wcpos/components/virtualized-list';
import { TableCell, TableRow } from '@wcpos/components/table';

import { getColumnStyle } from '../../data-table';
import { VariationRowProvider } from './context';
import { Variations } from './variations';

import type { Row, Table } from '@tanstack/react-table';

type ProductDocument = import('@wcpos/database').ProductDocument;

const duration = 500;

/**
 *
 */
export function VariableProductRow({
	item,
	index,
	table,
}: {
	item: Row<{ document: ProductDocument }>;
	index: number;
	table: Table<{ document: ProductDocument }>;
}) {
	const meta = table.options.meta as
		| {
				expanded$: import('rxjs').Observable<Record<string, boolean>>;
				setRowExpanded?: (rowId: string, expanded: boolean) => void;
		  }
		| undefined;
	const isExpanded = useObservableEagerState(
		meta!.expanded$.pipe(map((expanded: Record<string, boolean>) => !!expanded[item.id]))
	);

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
	return (
		<VirtualizedList.Item>
			<VariationRowProvider row={item} setRowExpanded={setRowExpanded}>
				<TableRow index={index}>
					{item
						.getVisibleCells()
						.map(
							(
								cell: import('@tanstack/react-table').Cell<{ document: ProductDocument }, unknown>
							) => {
								return (
									<TableCell key={cell.id} style={getColumnStyle(cell.column.columnDef.meta)}>
										{flexRender(cell.column.columnDef.cell, cell.getContext())}
									</TableCell>
								);
							}
						)}
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
						{shouldRender ? <Variations row={item} /> : null}
					</ScrollView>
				</Animated.View>
			</VariationRowProvider>
		</VirtualizedList.Item>
	);
}
