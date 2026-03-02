import * as React from 'react';
import { Platform, View } from 'react-native';

import * as ProgressPrimitive from '@rn-primitives/progress';
import Animated, {
	Extrapolation,
	interpolate,
	type SharedValue,
	useAnimatedReaction,
	useAnimatedStyle,
	useDerivedValue,
	withSpring,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

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
	return <PlatformIndicator value={value} sharedValue={sharedValue} className={className} />;
}

const PlatformIndicator = Platform.select({
	web: WebIndicator,
	native: NativeIndicator,
	default: NullIndicator,
});

type IndicatorProps = {
	value: number | undefined | null;
	sharedValue?: SharedValue<number>;
	className?: string;
};

function WebIndicator({ value, sharedValue, className }: IndicatorProps) {
	const [svProgress, setSvProgress] = React.useState<number | undefined>(sharedValue?.value);

	React.useEffect(() => {
		if (!sharedValue) {
			setSvProgress(undefined);
		}
	}, [sharedValue]);

	useAnimatedReaction(
		() => sharedValue?.value,
		(currentValue) => {
			scheduleOnRN(setSvProgress, currentValue);
		}
	);

	const progress = Math.max(0, Math.min(svProgress ?? value ?? 0, 100));

	return (
		<View
			className={cn('h-full w-full flex-1 transition-all')}
			style={{ transform: `translateX(-${100 - progress}%)` }}
		>
			<ProgressPrimitive.Indicator className={cn('bg-primary h-full w-full', className)} />
		</View>
	);
}

function NativeIndicator({ value, sharedValue, className }: IndicatorProps) {
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
		<Animated.View style={indicator} className={cn('h-full')}>
			<ProgressPrimitive.Indicator className={cn('bg-primary h-full w-full', className)} />
		</Animated.View>
	);
}

function NullIndicator(_props: IndicatorProps) {
	return <></>;
}
