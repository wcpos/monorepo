import * as React from 'react';

import { Row, Table } from '@tanstack/react-table';
import Animated, {
	cancelAnimation,
	useAnimatedStyle,
	useSharedValue,
	withSequence,
	withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { useCSSVariable } from 'uniwind';

import { cn } from '../lib/utils';

type PulseTableRowProps = React.ComponentPropsWithoutRef<typeof Animated.View> & {
	onRemove?: () => void;
	index?: number;
	row: Row<any>;
	table: Table<any>;
	ref?: React.Ref<PulseTableRowRef>;
};

interface PulseTableRowRef {
	pulseAdd: (callback?: () => void) => void;
	pulseRemove: (callback?: () => void) => void;
}

/**
 * Table row with pulse animation for add/remove feedback.
 * Uses theme-aware colors for alternating rows and pulse effects.
 */
function PulseTableRow({
	ref,
	className,
	index = 0,
	onRemove = () => {},
	row,
	table,
	...viewProps
}: PulseTableRowProps) {
	// Get theme-aware colors
	const [tableRowColor, tableRowAltColor, successColor, errorColor] = useCSSVariable([
		'--color-table-row',
		'--color-table-row-alt',
		'--color-success',
		'--color-error',
	]) as string[];

	// Determine the base color based on row index
	const baseColor = index % 2 === 0 ? tableRowColor : tableRowAltColor;

	// Shared value for animated background color
	const backgroundColor = useSharedValue(baseColor);

	// Update base color when theme colors change (baseColor already derives from index)
	React.useEffect(() => {
		backgroundColor.value = baseColor;
	}, [baseColor, backgroundColor]);

	const animatedStyle = useAnimatedStyle(() => {
		return {
			backgroundColor: backgroundColor.value,
		};
	});

	React.useImperativeHandle(
		ref,
		() => ({
			pulseAdd(callback?: () => void) {
				(table.options.meta as { scrollToRow?: (id: string) => void })?.scrollToRow?.(row.id);
				cancelAnimation(backgroundColor);
				// Pulse to success color then back to base
				backgroundColor.value = withSequence(
					withTiming(successColor, { duration: 400 }),
					withTiming(baseColor, { duration: 400 }, (finished) => {
						'worklet';
						if (finished && callback) {
							scheduleOnRN(callback);
						}
					})
				);
			},
			pulseRemove(callback?: () => void) {
				cancelAnimation(backgroundColor);
				// Pulse to error color
				backgroundColor.value = withTiming(errorColor, { duration: 400 }, (finished) => {
					'worklet';
					if (finished && callback) {
						scheduleOnRN(callback);
					}
				});
			},
		}),
		[backgroundColor, baseColor, successColor, errorColor, row.id, table]
	);

	return (
		<Animated.View
			className={cn('web:transition-colors web:data-[state=selected]:bg-muted flex-row', className)}
			style={animatedStyle}
			{...viewProps}
		/>
	);
}

PulseTableRow.displayName = 'PulseTableRow';

export { PulseTableRow };
export type { PulseTableRowRef };
