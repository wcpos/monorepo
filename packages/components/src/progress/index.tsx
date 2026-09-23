import * as React from 'react';
import { Platform, View } from 'react-native';

import * as ProgressPrimitive from '@rn-primitives/progress';
import Animated, {
	cancelAnimation,
	Extrapolation,
	interpolate,
	ReduceMotion,
	type SharedValue,
	useAnimatedReaction,
	useAnimatedStyle,
	useDerivedValue,
	useSharedValue,
	withRepeat,
	withSpring,
	withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { EASE, INDETERMINATE } from '../lib/motion';
import { cn } from '../lib/utils';

export function Progress({
	className,
	value,
	sharedValue,
	indicatorClassName,
	indeterminate,
	...props
}: ProgressPrimitive.RootProps & {
	indicatorClassName?: string;
	indeterminate?: boolean;
	sharedValue?: SharedValue<number>;
}) {
	return (
		<ProgressPrimitive.Root
			className={cn(
				'relative w-full overflow-hidden rounded-full',
				indeterminate ? 'bg-border h-0.5' : 'bg-muted h-2',
				className
			)}
			{...props}
		>
			{indeterminate ? (
				<Sweep />
			) : (
				<Indicator value={value} sharedValue={sharedValue} className={indicatorClassName} />
			)}
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

	useAnimatedReaction(
		() => sharedValue?.value,
		(currentValue) => {
			scheduleOnRN(setSvProgress, currentValue);
		}
	);

	// Derive directly during render: only honor the shared-value-driven state while a
	// sharedValue is present, so a stale value is ignored once it's removed (no effect
	// + setState needed to clear it).
	const effectiveSvProgress = sharedValue ? svProgress : undefined;
	const progress = Math.max(0, Math.min(effectiveSvProgress ?? value ?? 0, 100));

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

function Sweep() {
	return Platform.select({
		web: <View className="bg-primary web:animate-indeterminate absolute h-full w-1/3" />,
		native: <NativeSweep />,
		default: null,
	});
}

function NativeSweep() {
	// The measured track width is React state so the effect below owns the shared
	// value's mutations (the loader's pattern); the repeat starts once the track has
	// a width and stops on unmount.
	const [trackWidth, setTrackWidth] = React.useState(0);
	const translateX = useSharedValue(0);
	React.useEffect(() => {
		if (!trackWidth) return;
		translateX.value = -trackWidth / 3;
		translateX.value = withRepeat(
			withTiming(trackWidth, {
				duration: INDETERMINATE,
				easing: EASE,
				reduceMotion: ReduceMotion.Never,
			}),
			-1,
			false,
			undefined,
			ReduceMotion.Never
		);
		return () => cancelAnimation(translateX);
	}, [trackWidth, translateX]);
	const sweepStyle = useAnimatedStyle(() => ({ transform: [{ translateX: translateX.value }] }));
	return (
		<View
			className="absolute inset-0"
			onLayout={({ nativeEvent: { layout } }) => setTrackWidth(layout.width)}
		>
			<Animated.View className="bg-primary absolute h-full w-1/3" style={sweepStyle} />
		</View>
	);
}
