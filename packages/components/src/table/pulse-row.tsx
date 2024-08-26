import * as React from 'react';

import Animated, {
	useSharedValue,
	useAnimatedStyle,
	withTiming,
	runOnJS,
} from 'react-native-reanimated';

import { cn } from '../lib/utils';

type PulseTableRowProps = React.ComponentPropsWithoutRef<typeof Animated.View> & {
	onRemove?: () => void;
	index?: number;
};

/**
 *
 */
export const PulseTableRow = React.forwardRef<
	React.ElementRef<typeof Animated.View>,
	PulseTableRowProps
>(({ className, index = 0, onRemove = () => {}, ...props }, ref) => {
	const backgroundColor = useSharedValue('transparent');

	const animatedStyle = useAnimatedStyle(() => {
		return {
			backgroundColor: backgroundColor.value,
		};
	});

	/**
	 * Expose methods via the ref to trigger animations
	 */
	React.useImperativeHandle(ref, () => ({
		pulseAdd() {
			backgroundColor.value = withTiming('rgba(34, 197, 94, 0.5)', { duration: 500 }, () => {
				backgroundColor.value = withTiming('transparent');
			});
		},
		pulseRemove(callback) {
			backgroundColor.value = withTiming('rgba(239, 68, 68, 0.5)', { duration: 500 }, callback);
		},
	}));

	return (
		<Animated.View
			ref={ref}
			className={cn(
				'flex-row web:transition-colors web:data-[state=selected]:bg-muted',
				index % 2 && 'bg-muted/40 dark:bg-zinc-900/50',
				className
			)}
			style={animatedStyle}
			{...props}
		/>
	);
});
PulseTableRow.displayName = 'PulseTableRow';
