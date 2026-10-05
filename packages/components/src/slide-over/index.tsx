import * as React from 'react';
import { View, type ViewStyle } from 'react-native';

import Animated, { cubicBezier, useReducedMotion } from 'react-native-reanimated';

import { EASE_EXIT_POINTS, EASE_POINTS, PANE, PANEL_SLIDE_OUT } from '../lib/motion';
import { cn } from '../lib/utils';

// Arriving: the same beat as a pane push; the cover travels the whole surface it lands on.
// Leaving: quicker, and speeding up into the edge.
const ARRIVE = cubicBezier(...EASE_POINTS);
const LEAVE = cubicBezier(...EASE_EXIT_POINTS);

export type SlideOverProps = {
	open: boolean;
	/** The edge the cover comes out of, and goes back into. */
	from: 'top' | 'bottom' | 'left' | 'right';
	children: React.ReactNode;
	/** Places the frame the cover travels in; the frame clips it at the edge it comes from. */
	className?: string;
	style?: ViewStyle;
	/** The cover hides what is under it, so it needs the surface's own opaque background. */
	coverClassName?: string;
	/** Called once the cover has slid out and unmounted. */
	onLeft?: () => void;
	testID?: string;
};

/**
 * A cover that slides out of one edge of its frame and back into it. The frame clips, so
 * the cover appears to come out of whatever sits against that edge. The cover stays mounted
 * until it has left, only `transform` animates, and what it covers does not move.
 *
 * The slide is a Reanimated CSS transition, not a shared value driven from JavaScript: on
 * web the browser runs it off the main thread, so a screen that is busy laying itself out
 * around the cover (the orders list beside its pane) cannot drop the slide.
 */
export function SlideOver({
	open,
	from,
	children,
	className,
	style,
	coverClassName,
	onLeft,
	testID,
}: SlideOverProps) {
	const reduced = useReducedMotion();
	const [staged, setStaged] = React.useState(open);
	// `landed` moves one frame after `staged`: the cover is painted parked outside its frame
	// first, so the transition has a position to start from.
	// A cover that mounts already open is in place: nothing slides on mount.
	const [landed, setLanded] = React.useState(open);
	const left = React.useRef(onLeft);
	React.useEffect(() => {
		left.current = onLeft;
	});
	if (open && !staged) setStaged(true);
	if (!open && landed) setLanded(false);

	React.useEffect(() => {
		if (open) {
			const frame = requestAnimationFrame(() => setLanded(true));
			return () => cancelAnimationFrame(frame);
		}
		// A cover that never opened has nothing to leave.
		if (!staged) return;
		// A close interrupted by a reopen clears this, and the cover stays.
		const timer = setTimeout(
			() => {
				setStaged(false);
				left.current?.();
			},
			reduced ? 0 : PANEL_SLIDE_OUT
		);
		return () => clearTimeout(timer);
	}, [open, staged, reduced]);

	if (!staged) return null;
	// A percentage is of the cover's own size: nothing to measure before the first frame.
	const parked = from === 'bottom' || from === 'right' ? '100%' : '-100%';
	const offset = landed ? '0%' : parked;
	return (
		<View
			className={cn('overflow-hidden', className)}
			style={[style, { pointerEvents: 'box-none' }]}
			testID={testID}
		>
			<Animated.View
				className={cn('flex-1', coverClassName)}
				// A cover that is leaving is already gone to a screen reader.
				aria-hidden={!open}
				style={{
					transform: [
						from === 'left' || from === 'right' ? { translateX: offset } : { translateY: offset },
					],
					transitionProperty: 'transform',
					transitionDuration: reduced ? 0 : landed ? PANE : PANEL_SLIDE_OUT,
					transitionTimingFunction: landed ? ARRIVE : LEAVE,
					pointerEvents: open ? 'auto' : 'none',
				}}
			>
				{children}
			</Animated.View>
		</View>
	);
}
