import * as React from 'react';

import { Row, Table } from '@tanstack/react-table';
import Animated, {
	useSharedValue,
	useAnimatedStyle,
	withTiming,
	withSequence,
	cancelAnimation,
} from 'react-native-reanimated';

import { cn } from '../lib/utils';

type PulseTableRowProps = React.ComponentPropsWithoutRef<typeof Animated.View> & {
	onRemove?: () => void;
	index?: number;
	row: Row<any>;
	table: Table<any>;
};

type PulseTableRowHandle = {
	pulseAdd: (callback?: () => void) => void;
	pulseRemove: (callback?: () => void) => void;
};

/**
 *
 */
export const PulseTableRow = React.forwardRef<PulseTableRowHandle, PulseTableRowProps>(
	({ className, index = 0, onRemove = () => {}, ...props }, ref) => {
		const localRef = React.useRef<Animated.View>(null);

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

		React.useImperativeHandle(ref, () => ({
			...localRef.current,
			pulseAdd(callback?: () => void) {
				props.table.options.meta?.scrollToRow(props.row.id);
				cancelAnimation(backgroundColor);
				backgroundColor.value = withSequence(
					withTiming('hsla(162, 63%, 41%, 0.8)', { duration: 500 }),
					withTiming(
						index % 2 === 0 ? 'transparent' : 'hsla(210, 40%, 96%, 0.4)',
						{ duration: 500 },
						() => {
							if (callback) callback();
						}
					)
				);
			},
			pulseRemove(callback?: () => void) {
				cancelAnimation(backgroundColor);
				backgroundColor.value = withTiming('hsl(356, 75%, 53%)', { duration: 500 }, () => {
					backgroundColor.value = index % 2 === 0 ? 'transparent' : 'hsla(210, 40%, 96%, 0.4)';
					if (callback) callback();
				});
			},
		}));

		return (
			<Animated.View
				ref={localRef}
				className={cn(
					'flex-row web:transition-colors web:data-[state=selected]:bg-muted',
					className
				)}
				style={animatedStyle}
				{...props}
			/>
		);
	}
);

PulseTableRow.displayName = 'PulseTableRow';
