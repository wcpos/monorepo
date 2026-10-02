import * as React from 'react';
import { Platform, View } from 'react-native';

import Animated, {
	ReduceMotion,
	useAnimatedStyle,
	useSharedValue,
	withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { EASE, PANE } from '../lib/motion';
import { cn } from '../lib/utils';

// Decision 32 (2026-09-16): the pane underneath drifts 24% of the stage and dims to 0.35
// while the new one travels the full width over it.
const DRIFT = 0.24;
const DIM = 0.35;
const TIMING = { duration: PANE, easing: EASE, reduceMotion: ReduceMotion.System };

// Web only: a covered pane leaves the tab order and the accessibility tree but keeps its
// layout, so its list is still scrolled to the same row when it comes back.
const COVERED = Platform.OS === 'web' ? ({ visibility: 'hidden' } as object) : null;

export type PaneStackProps<T> = {
	/** What is drilled into; `null` shows the root pane. */
	detail: T | null;
	renderDetail: (detail: T) => React.ReactNode;
	/** The root pane. It stays mounted underneath the detail. */
	children: React.ReactNode;
	className?: string;
	/** The detail pane covers the root, so it needs the surface's own opaque background. */
	paneClassName?: string;
	testID?: string;
};

/**
 * Two panes on one stage, pushed and popped like a navigator's: both stay mounted for the
 * whole transition and one shared value moves them together. Only `transform` and `opacity`
 * animate, and nothing animates on mount.
 *
 * The push never waits for the detail's data: it answers the tap on the next frame. A
 * detail that loads late must load into a frame of the same size (see `DataTableSkeleton`),
 * so what arrives mid-flight changes the pane's contents and not its layout.
 */
export function PaneStack<T>({
	detail,
	renderDetail,
	children,
	className,
	paneClassName,
	testID,
}: PaneStackProps<T>) {
	const progress = useSharedValue(0);
	const width = useSharedValue(0);
	// The detail on stage outlives `detail` by one pop, so it can travel off.
	const [staged, setStaged] = React.useState<T | null>(null);
	const [settled, setSettled] = React.useState(false);
	const open = detail !== null;
	if (open && detail !== staged) setStaged(detail);
	if (!open && settled) setSettled(false);

	// What had focus when the detail was pushed (the row that opened it) gets it back on the
	// pop: the control that popped is inside the pane that is leaving.
	const opener = React.useRef<HTMLElement | null>(null);
	React.useEffect(() => {
		if (typeof document === 'undefined') return;
		if (open) {
			opener.current = document.activeElement as HTMLElement | null;
			return;
		}
		if (opener.current?.isConnected) opener.current.focus({ preventScroll: true });
		opener.current = null;
	}, [open]);

	React.useEffect(() => {
		if (!open) {
			progress.value = withTiming(0, TIMING, (finished) => {
				'worklet';
				if (finished) scheduleOnRN(setStaged, null);
			});
			return;
		}
		// A frame later, so the pane's first paint is not competing with its first move.
		const frame = requestAnimationFrame(() => {
			progress.value = withTiming(1, TIMING, (finished) => {
				'worklet';
				if (finished) scheduleOnRN(setSettled, true);
			});
		});
		return () => cancelAnimationFrame(frame);
	}, [open, progress]);

	// Clamped: a first frame stamped a hair before the animation's start asks the easing for
	// a negative time, and a bezier extrapolates — one frame of the pane stepping backwards.
	const rootStyle = useAnimatedStyle(() => {
		const travelled = Math.min(1, Math.max(0, progress.value));
		return {
			opacity: 1 - travelled * (1 - DIM),
			transform: [{ translateX: -travelled * width.value * DRIFT }],
		};
	});
	const detailStyle = useAnimatedStyle(() => {
		const travelled = Math.min(1, Math.max(0, progress.value));
		return { transform: [{ translateX: (1 - travelled) * width.value }] };
	});

	return (
		<View
			className={cn('flex-1 overflow-hidden', className)}
			testID={testID}
			onLayout={(event) => {
				width.value = event.nativeEvent.layout.width;
			}}
		>
			<Animated.View
				className="flex-1"
				aria-hidden={open}
				style={[rootStyle, { pointerEvents: open ? 'none' : 'auto' }, open && settled && COVERED]}
			>
				{children}
			</Animated.View>
			{staged !== null && (
				<Animated.View
					className={cn('absolute inset-0', paneClassName)}
					// A pane that is leaving is already gone to a screen reader.
					aria-hidden={!open}
					style={[detailStyle, { pointerEvents: open ? 'auto' : 'none' }]}
				>
					{renderDetail(staged)}
				</Animated.View>
			)}
		</View>
	);
}
