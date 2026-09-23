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
			value={indeterminate ? undefined : value}
			{...props}
			// The native primitive normalises a missing value to 0 and announces "0%";
			// an unknown wait is busy with no current value (web's Radix root already
			// treats a missing value as indeterminate).
			{...(indeterminate
				? {
						// Only the numeric value is misleading; a caller's status text
						// ("Syncing…") still says what the unknown wait is for.
						accessibilityValue: {
							...props.accessibilityValue,
							min: 0,
							max: props.max ?? 100,
							now: undefined,
						},
						accessibilityState: { ...props.accessibilityState, busy: true },
						'aria-valuenow': undefined,
						'aria-valuetext': props['aria-valuetext'],
					}
				: {})}
		>
			{indeterminate ? (
				<Sweep className={indicatorClassName} />
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

function Sweep({ className }: { className?: string }) {
	return Platform.select({
		web: (
			<View
				className={cn('bg-primary web:animate-indeterminate absolute h-full w-1/3', className)}
			/>
		),
		native: <NativeSweep className={className} />,
		default: null,
	});
}

function NativeSweep({ className }: { className?: string }) {
	const trackWidth = useSharedValue(0);
	// A width-free loop: the repeat runs 0 → 1 from mount on the UI thread and the
	// style scales it by the measured track, so a track that resizes mid-loop
	// (rotation, split view) changes the distance and never the phase. The sweep
	// sits one third off the left edge and travels the track plus its own width;
	// before the first layout the width is 0 and it stays off-screen.
	const progress = useDerivedValue(() =>
		withRepeat(
			withTiming(1, { duration: INDETERMINATE, easing: EASE, reduceMotion: ReduceMotion.Never }),
			-1,
			false,
			undefined,
			ReduceMotion.Never
		)
	);
	// Mount-only cleanup: the shared value is captured in a ref so a re-render can
	// never cancel a live sweep; only unmount does.
	const progressRef = React.useRef(progress);
	React.useEffect(() => () => cancelAnimation(progressRef.current), []);
	const sweepStyle = useAnimatedStyle(() => ({
		transform: [{ translateX: progress.value * ((trackWidth.value * 4) / 3) }],
	}));
	return (
		<View
			className="absolute inset-0"
			onLayout={({ nativeEvent: { layout } }) => {
				trackWidth.value = layout.width;
			}}
		>
			<Animated.View
				className={cn('bg-primary absolute -left-1/3 h-full w-1/3', className)}
				style={sweepStyle}
			/>
		</View>
	);
}
