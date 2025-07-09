import * as React from 'react';
import { ScrollView } from 'react-native';

import { useObservableEagerState } from 'observable-hooks';
import Animated, {
	runOnJS,
	useAnimatedStyle,
	useDerivedValue,
	useSharedValue,
	withTiming,
} from 'react-native-reanimated';
import { map } from 'rxjs/operators';
import { flexRender } from '@tanstack/react-table';

import * as VirtualizedList from '@wcpos/components/virtualized-list';
import { TableCell, TableRow } from '@wcpos/components/table';

import { getColumnStyle } from '../../data-table';
import { VariationRowProvider } from './context';
import { Variations } from './variations';

const duration = 500;

/**
 *
 */
export function VariableProductRow({ item, index, table }) {
	const isExpanded = useObservableEagerState(
		table.options.meta.expanded$.pipe(map((expanded) => !!expanded[item.id]))
	);

	/**
	 * Animation setup
	 */
	const height = useSharedValue(0);
	const [shouldRender, setShouldRender] = React.useState(isExpanded);

	const derivedHeight = useDerivedValue(() => {
		// Handle mounting when expanding
		if (isExpanded && !shouldRender) {
			runOnJS(setShouldRender)(true);
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
					runOnJS(setShouldRender)(false);
				}
			}
		);
	}, [isExpanded]);

	const animatedStyle = useAnimatedStyle(() => ({
		height: derivedHeight.value,
		opacity: derivedHeight.value === 0 ? 0 : 1,
	}));

	/**
	 * Render the row and the animated Variations component
	 */
	return (
		<VirtualizedList.Item>
			<VariationRowProvider row={item}>
				<TableRow index={index}>
					{item.getVisibleCells().map((cell) => {
						return (
							<TableCell key={cell.id} style={getColumnStyle(cell.column.columnDef.meta)}>
								{flexRender(cell.column.columnDef.cell, cell.getContext())}
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
						{shouldRender && <Variations row={item} />}
					</ScrollView>
				</Animated.View>
			</VariationRowProvider>
		</VirtualizedList.Item>
	);
}
