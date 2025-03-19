import * as React from 'react';

import { useAugmentedRef } from '@rn-primitives/hooks';
import { Row, Table } from '@tanstack/react-table';
import Animated, {
	useSharedValue,
	useAnimatedStyle,
	withTiming,
	withSequence,
	cancelAnimation,
	runOnJS,
} from 'react-native-reanimated';

import { cn } from '../lib/utils';

type PulseTableRowProps = React.ComponentPropsWithoutRef<typeof Animated.View> & {
	onRemove?: () => void;
	index?: number;
	row: Row<any>;
	table: Table<any>;
};

interface PulseTableRowRef extends React.RefObject<Animated.View> {
	pulseAdd: (callback?: () => void) => void;
	pulseRemove: (callback?: () => void) => void;
}

/**
 *
 */
export const PulseTableRow = React.forwardRef<PulseTableRowRef, PulseTableRowProps>(
	({ className, index = 0, onRemove = () => {}, ...props }, ref) => {
		const backgroundColor = useSharedValue(
			index % 2 === 0 ? 'transparent' : 'hsla(210, 40%, 96%, 0.4)'
		);

		React.useEffect(() => {
			backgroundColor.value = index % 2 === 0 ? 'transparent' : 'hsla(210, 40%, 96%, 0.4)';
		}, [index]);

		const animatedStyle = useAnimatedStyle(() => {
			return {
				backgroundColor: backgroundColor.value,
			};
		});

		const augmentedRef = useAugmentedRef({
			ref,
			methods: {
				pulseAdd(callback?: () => void) {
					props.table.options.meta?.scrollToRow(props.row.id);
					cancelAnimation(backgroundColor);
					backgroundColor.value = withSequence(
						withTiming('hsla(162, 63%, 41%, 0.8)', { duration: 500 }),
						withTiming(
							index % 2 === 0 ? 'transparent' : 'hsla(210, 40%, 96%, 0.4)',
							{ duration: 500 },
							callback
								? () => {
										'worklet';
										runOnJS(callback)();
									}
								: undefined
						)
					);
				},
				pulseRemove(callback?: () => void) {
					cancelAnimation(backgroundColor);
					backgroundColor.value = withTiming(
						'hsl(356, 75%, 53%)',
						{ duration: 500 },
						callback
							? () => {
									'worklet';
									runOnJS(callback)();
								}
							: undefined
					);
				},
			},
		});

		return (
			<Animated.View
				ref={augmentedRef}
				className={cn(
					'web:transition-colors web:data-[state=selected]:bg-muted flex-row',
					className
				)}
				style={animatedStyle}
				{...props}
			/>
		);
	}
);

PulseTableRow.displayName = 'PulseTableRow';
