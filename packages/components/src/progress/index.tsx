import * as React from 'react';

import * as ProgressPrimitive from '@rn-primitives/progress';
import Animated, {
	Extrapolation,
	interpolate,
	type SharedValue,
	useAnimatedStyle,
	useDerivedValue,
	withSpring,
} from 'react-native-reanimated';

import { cn } from '../lib/utils';

export function Progress({
	className,
	value,
	sharedValue,
	indicatorClassName,
	...props
}: ProgressPrimitive.RootProps & {
	indicatorClassName?: string;
	sharedValue?: SharedValue<number>;
}) {
	return (
		<ProgressPrimitive.Root
			className={cn(
				'bg-secondary/20 relative h-2.5 w-full overflow-hidden rounded-full',
				className
			)}
			{...props}
		>
			<Indicator value={value} sharedValue={sharedValue} className={indicatorClassName} />
		</ProgressPrimitive.Root>
	);
}

function Indicator({
	value,
	sharedValue,
	className,
}: {
	value: number | undefined | null;
	sharedValue?: SharedValue<number>;
	className?: string;
}) {
	const progress = useDerivedValue(() => sharedValue?.value ?? value ?? 0);

	const indicator = useAnimatedStyle(() => {
		return {
			width: withSpring(
				`${interpolate(progress.value, [0, 100], [1, 100], Extrapolation.CLAMP)}%`,
				{ overshootClamping: true }
			),
		};
	});

	return (
		<ProgressPrimitive.Indicator asChild>
			<Animated.View style={indicator} className={cn('bg-primary h-full', className)} />
		</ProgressPrimitive.Indicator>
	);
}
