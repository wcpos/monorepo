import * as React from 'react';
import { View, type ViewStyle } from 'react-native';

import Animated, {
	ReduceMotion,
	useAnimatedStyle,
	useSharedValue,
	withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { EASE, EASE_EXIT, PANE, PANEL_SLIDE_OUT } from '../lib/motion';
import { cn } from '../lib/utils';

// The same beat as a pane push: the cover travels the whole surface it lands on.
const TIMING = { duration: PANE, easing: EASE, reduceMotion: ReduceMotion.System };
const LEAVING = { duration: PANEL_SLIDE_OUT, easing: EASE_EXIT, reduceMotion: ReduceMotion.System };

export type SlideOverProps = {
	open: boolean;
	/** The edge the cover comes out of, and goes back into. */
	from: 'top' | 'bottom';
	children: React.ReactNode;
	/** Places the frame the cover travels in; the frame clips it at the edge it comes from. */
	className?: string;
	style?: ViewStyle;
	/** The cover hides what is under it, so it needs the surface's own opaque background. */
	coverClassName?: string;
	testID?: string;
};

/**
 * A cover that slides out of one edge of its frame and back into it. The frame clips, so
 * the cover appears to come out of whatever sits against that edge. The cover stays mounted
 * until it has left, only `transform` animates, and what it covers does not move.
 */
export function SlideOver({
	open,
	from,
	children,
	className,
	style,
	coverClassName,
	testID,
}: SlideOverProps) {
	const progress = useSharedValue(0);
	const [staged, setStaged] = React.useState(open);
	if (open && !staged) setStaged(true);

	React.useEffect(() => {
		if (!open) {
			progress.value = withTiming(0, LEAVING, (finished) => {
				'worklet';
				if (finished) scheduleOnRN(setStaged, false);
			});
			return;
		}
		// One frame with the cover parked outside its frame, so the slide starts from a
		// painted position instead of being the first thing painted.
		const frame = requestAnimationFrame(() => {
			progress.value = withTiming(1, TIMING);
		});
		return () => cancelAnimationFrame(frame);
	}, [open, progress]);

	const coverStyle = useAnimatedStyle(() => {
		// A bezier asked for a time just outside its range extrapolates; never past the frame.
		const hidden = 1 - Math.min(1, Math.max(0, progress.value));
		// A percentage is of the cover's own height: nothing to measure before the first frame.
		const offset = (from === 'bottom' ? hidden : -hidden) * 100;
		return { transform: [{ translateY: `${offset}%` }] };
	});

	if (!staged) return null;
	return (
		<View
			className={cn('overflow-hidden', className)}
			style={[style, { pointerEvents: 'box-none' }]}
			testID={testID}
		>
			<Animated.View
				className={cn('flex-1', coverClassName)}
				style={[coverStyle, { pointerEvents: open ? 'auto' : 'none' }]}
			>
				{children}
			</Animated.View>
		</View>
	);
}
