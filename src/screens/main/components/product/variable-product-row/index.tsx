import * as React from 'react';

import { useObservableEagerState } from 'observable-hooks';
import Animated, {
	useAnimatedStyle,
	useDerivedValue,
	useSharedValue,
	withTiming,
	runOnJS,
} from 'react-native-reanimated';
import { map } from 'rxjs/operators';

import { DataTableRow, useDataTable } from '@wcpos/components/src/data-table';

import { VariationRowProvider } from './context';
import { Variations } from './variations';

const duration = 500;

/**
 *
 */
export const VariableProductRow = ({ row, index }) => {
	const { table } = useDataTable();
	const isExpanded = useObservableEagerState(
		table.options.meta.expanded$.pipe(map((expanded) => !!expanded[row.id]))
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
		<VariationRowProvider row={row}>
			<DataTableRow row={row} index={index} />
			{shouldRender && (
				<Animated.View style={[animatedStyle, { overflow: 'hidden' }]}>
					<Variations
						row={row}
						onLayout={(e) => {
							height.value = e.nativeEvent.layout.height;
						}}
					/>
				</Animated.View>
			)}
		</VariationRowProvider>
	);
};
