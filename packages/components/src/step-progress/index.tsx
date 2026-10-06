import * as React from 'react';
import { View, type ViewProps } from 'react-native';

import Animated, {
	cancelAnimation,
	Easing,
	ReduceMotion,
	useAnimatedStyle,
	useSharedValue,
	withDelay,
	withRepeat,
	withSequence,
	withSpring,
	withTiming,
} from 'react-native-reanimated';

import { Icon } from '../icon';
import { EASE } from '../lib/motion';
import { cn } from '../lib/utils';
import { Text } from '../text';

/**
 * A row of steps on one rail: what is done, where we are, what is to come.
 *
 * One badge, three states. To come is a hollow bead on the rail. Here is the ring: the
 * surface inside, the colour on the border, a dot in the middle. Done is the same badge
 * closed: the dot has grown to fill the ring and the tick sits on the solid face. A failed
 * step closes red with a cross; a stopped one (cancelled, timed out, released) closes grey
 * with a dash, because nobody lost money.
 *
 * Moving on is one sequence: the ring you leave closes and its tick pops; the fill runs
 * along the rail to the next step and stops there; the next ring boinks in. Nothing moves
 * ahead of where you are, and nothing moves on mount. Only `transform` and `opacity`
 * animate (owner's sign-off on the drawing, 2026-10-06).
 */

export type StepProgressStatus = 'active' | 'complete' | 'failed' | 'stopped';
export type StepProgressSize = 'default' | 'compact';
export interface StepProgressStep {
	label: string;
	/** A line under the label: the time the step was reached, a count. */
	caption?: string | null;
}
export interface StepProgressProps extends ViewProps {
	steps: StepProgressStep[];
	/** The step in progress; with `complete` every step is done whatever this says. */
	current: number;
	status?: StepProgressStatus;
	size?: StepProgressSize;
	/** The surface the row sits on: the beads and the open ring show it through their middle. */
	surfaceClassName?: string;
	/** A stable testID for each node; the current node also carries `aria-selected`. */
	stepTestID?: (index: number) => string;
}

type NodeState = 'todo' | 'current' | 'done' | 'failed' | 'stopped';

const GEOMETRY = {
	default: { node: 28, rail: 4, bead: 12, core: 11, mark: 'size-4', label: 'text-sm' },
	compact: { node: 16, rail: 3, bead: 8, core: 6, mark: 'size-2.5', label: 'text-xs' },
} as const;

// The hand-off, in ms from the moment the state changes: the badge you leave closes over
// CLOSE and its face goes solid just before the core reaches the edge (the two anti-alias
// against each other otherwise); the tick pops at MARK; the fill sets off at FILL_START and
// arrives FILL later; the next ring boinks in at ARRIVE, as the fill reaches it.
const CLOSE = 360;
const FACE = 260;
const MARK = 260;
const FILL_START = 300;
const FILL = 400;
const ARRIVE = 600;
const CORE_FULL = 2.6;
// The face snaps solid in a few frames; a badge going back out fades in BADGE_OUT; a spring
// that must start from a set scale gets there in one frame (AT_ONCE).
const FACE_SNAP = 60;
const BADGE_OUT = 150;
const AT_ONCE = 1;
const SYSTEM = { reduceMotion: ReduceMotion.System };
const CLOSE_TIMING = { duration: CLOSE, easing: Easing.inOut(Easing.cubic), ...SYSTEM };
const FILL_TIMING = { duration: FILL, easing: EASE, ...SYSTEM };
// The boink: a loose spring from a little under size, so the badge arrives big and settles.
const BOINK = { stiffness: 320, damping: 10, mass: 0.7, ...SYSTEM };
// The tick: draws past its size and squashes back (the juicy bit, owner 2026-10-06).
const POP = 1.4;
const POP_UP = 160;
const POP_TIMING = { duration: POP_UP, easing: EASE, ...SYSTEM };
const POP_SETTLE = { stiffness: 380, damping: 11, mass: 0.6, ...SYSTEM };
// While we wait on a step its ring beats softly every BEAT_EVERY: a smaller boink.
const BEAT_EVERY = 2400;
const BEAT = 1.14;
const BEAT_SWELL = 240;
const BEAT_TIMING = { duration: BEAT_SWELL, easing: EASE, ...SYSTEM };
// A failed step shakes its head once.
const SHAKE = [-4, 4, -2, 1, 0];
const SHAKE_TICK = 70;
const SHAKE_STEP = { duration: SHAKE_TICK, easing: Easing.linear, ...SYSTEM };

// Literal class names, so Tailwind emits every one (a border built from a bg string at
// runtime is never scanned).
const TONES = {
	primary: { bg: 'bg-primary', border: 'border-primary', mark: 'text-primary-foreground' },
	success: { bg: 'bg-success', border: 'border-success', mark: 'text-success-foreground' },
	// The path behind a failed or stopped step: present, but not the thing to look at. Its
	// half-strength disc sits close to the surface, so the mark is the foreground, not white.
	quiet: {
		bg: 'bg-muted-foreground/50',
		border: 'border-muted-foreground/50',
		mark: 'text-foreground',
	},
	destructive: {
		bg: 'bg-destructive',
		border: 'border-destructive',
		mark: 'text-destructive-foreground',
	},
	muted: { bg: 'bg-muted-foreground', border: 'border-muted-foreground', mark: 'text-card' },
} as const;
type DoneTone = 'primary' | 'success' | 'quiet';

function nodeState(index: number, current: number, status: StepProgressStatus): NodeState {
	if (status === 'complete') return 'done';
	if (index < current) return 'done';
	if (index > current) return 'todo';
	return status === 'failed' ? 'failed' : status === 'stopped' ? 'stopped' : 'current';
}
const closed = (state: NodeState) => state === 'done' || state === 'failed' || state === 'stopped';

export function StepProgress({
	steps,
	current,
	status = 'active',
	size = 'default',
	surfaceClassName = 'bg-card',
	stepTestID,
	className,
	...props
}: StepProgressProps) {
	const n = Math.max(steps.length, 1);
	const geometry = GEOMETRY[size];
	// The fill: 0 at the first node, 1 at the last. A failed or stopped step is reached, so the
	// fill runs up to it; complete runs to the end.
	const target = status === 'complete' ? 1 : n > 1 ? Math.min(current, n - 1) / (n - 1) : 0;
	const progress = useSharedValue(target);
	const was = React.useRef(target);
	React.useLayoutEffect(() => {
		if (was.current === target) return;
		// Forwards travels after the badge behind it has closed; backwards (a retry) just goes.
		progress.value =
			target > was.current
				? withDelay(FILL_START, withTiming(target, FILL_TIMING))
				: withTiming(target, FILL_TIMING);
		was.current = target;
	}, [target, progress]);
	// Positioned at the left edge and pushed back by what is not yet travelled, so the only
	// animated property is a transform and no transform origin is involved.
	const fillStyle = useAnimatedStyle(() => ({
		transform: [{ translateX: `${(progress.value - 1) * 100}%` }],
	}));
	const doneTone: DoneTone =
		status === 'complete'
			? 'success'
			: status === 'failed' || status === 'stopped'
				? 'quiet'
				: 'primary';
	// Compact rows run the rail between the outer beads; the default row centres each node in
	// an equal column, so the rail starts and ends half a column in.
	const inset = size === 'compact' ? geometry.node / 2 : `${50 / n}%`;
	return (
		<View className={cn('relative w-full', className)} {...props}>
			<View
				aria-hidden
				className="bg-border absolute overflow-hidden rounded-full"
				style={{
					top: (geometry.node - geometry.rail) / 2,
					height: geometry.rail,
					left: inset,
					right: inset,
				}}
			>
				<Animated.View
					className={cn('h-full w-full rounded-full', TONES[doneTone].bg)}
					style={fillStyle}
				/>
			</View>
			<View
				className={cn('flex-row', size === 'compact' ? 'justify-between' : 'items-start')}
				role="list"
			>
				{steps.map((step, index) => (
					<StepNode
						key={index}
						label={step.label}
						caption={step.caption ?? null}
						state={nodeState(index, current, status)}
						doneTone={doneTone}
						size={size}
						surfaceClassName={surfaceClassName}
						testID={stepTestID?.(index)}
					/>
				))}
			</View>
		</View>
	);
}

function StepNode({
	label,
	caption,
	state,
	doneTone,
	size,
	surfaceClassName,
	testID,
}: {
	label: string;
	caption: string | null;
	state: NodeState;
	doneTone: DoneTone;
	size: StepProgressSize;
	surfaceClassName: string;
	testID?: string;
}) {
	const geometry = GEOMETRY[size];
	// Shared values start where the state is, so a row that mounts mid-flow draws itself at
	// rest: nothing animates on mount.
	const badge = useSharedValue(state === 'todo' ? 0 : 1);
	const core = useSharedValue(closed(state) ? CORE_FULL : 1);
	const face = useSharedValue(closed(state) ? 1 : 0);
	const mark = useSharedValue(closed(state) ? 1 : 0);
	const shake = useSharedValue(0);
	const seen = React.useRef(state);
	// When the badge will have visibly arrived. Every transition that opens or closes a badge
	// after a wait records it, and every later transition waits out what is left, so a step
	// that changes again inside the 600 ms (the terminal answered and failed; a jump forward
	// and back) never shows a badge ahead of the fill.
	const arrivesAt = React.useRef(0);
	const pending = () => Math.max(0, arrivesAt.current - Date.now());
	React.useLayoutEffect(() => {
		const from = seen.current;
		if (from === state) return;
		seen.current = state;
		cancelAnimation(badge);
		cancelAnimation(core);
		cancelAnimation(face);
		cancelAnimation(mark);
		cancelAnimation(shake);
		shake.value = 0;
		if (state === 'todo') {
			// Going back (a retry re-sends): nothing to celebrate, the badge just goes.
			badge.value = withTiming(0, { duration: BADGE_OUT, easing: EASE, ...SYSTEM });
			core.value = 1;
			face.value = 0;
			mark.value = 0;
			return;
		}
		if (state === 'current') {
			core.value = 1;
			face.value = 0;
			mark.value = 0;
			// Arriving from ahead waits, hidden, for the fill to reach it; a retry from a closed
			// badge opens at once. Either way the spring starts from a little under size.
			const wait = from === 'todo' ? ARRIVE : pending();
			arrivesAt.current = Date.now() + wait;
			// A badge caught mid-fade-out, or one still waiting to open, must not wait half-visible.
			badge.value = wait === 0 ? 0.55 : 0;
			badge.value = withDelay(
				wait,
				withSequence(
					withTiming(0.55, { duration: AT_ONCE }),
					withSpring(1, BOINK),
					withRepeat(
						withSequence(
							withDelay(BEAT_EVERY - 3 * BEAT_TIMING.duration, withTiming(BEAT, BEAT_TIMING)),
							withTiming(0.97, BEAT_TIMING),
							withTiming(1, BEAT_TIMING)
						),
						-1
					)
				)
			);
			return;
		}
		// Closing: done, failed or stopped. A badge that was open and mid-beat settles to size as
		// it closes. One that was not open yet (a jump of two steps, or a failure before the first
		// poll answered) waits for the fill to reach it, then opens and closes in one motion, so
		// nothing on the rail is ever ahead of the fill.
		const wait = from === 'todo' ? ARRIVE : pending();
		arrivesAt.current = Date.now() + wait;
		if (wait) badge.value = 0;
		badge.value = withDelay(wait, withSpring(1, BOINK));
		core.value = withDelay(wait, withTiming(CORE_FULL, CLOSE_TIMING));
		face.value = withDelay(
			wait + FACE,
			withTiming(1, { duration: FACE_SNAP, easing: Easing.linear, ...SYSTEM })
		);
		mark.value = withDelay(
			wait + MARK,
			withSequence(withTiming(POP, POP_TIMING), withSpring(1, POP_SETTLE))
		);
		if (state === 'failed') {
			shake.value = withDelay(
				wait + MARK,
				withSequence(...SHAKE.map((x) => withTiming(x, SHAKE_STEP)))
			);
		}
	}, [state, badge, core, face, mark, shake]);

	const badgeStyle = useAnimatedStyle(() => ({
		opacity: badge.value > 0.55 ? 1 : badge.value / 0.55,
		transform: [{ scale: badge.value }],
	}));
	const beadStyle = useAnimatedStyle(() => ({ opacity: 1 - Math.min(badge.value / 0.55, 1) }));
	const coreStyle = useAnimatedStyle(() => ({ transform: [{ scale: core.value }] }));
	const faceStyle = useAnimatedStyle(() => ({ opacity: face.value }));
	const markStyle = useAnimatedStyle(() => ({
		opacity: Math.min(mark.value * 4, 1),
		transform: [{ scale: mark.value }],
	}));
	const shakeStyle = useAnimatedStyle(() => ({ transform: [{ translateX: shake.value }] }));

	const {
		bg: tone,
		border,
		mark: markTone,
	} = TONES[
		state === 'failed'
			? 'destructive'
			: state === 'stopped'
				? 'muted'
				: state === 'done'
					? doneTone
					: 'primary'
	];
	const labelTone =
		state === 'failed'
			? 'text-destructive'
			: state === 'current' || state === 'stopped'
				? 'text-foreground'
				: 'text-muted-foreground';
	const icon = state === 'failed' ? 'xmark' : state === 'stopped' ? 'minus' : 'check';
	return (
		<View
			role="listitem"
			className={cn('items-center', size === 'compact' ? '' : 'min-w-0 flex-1 px-0.5')}
		>
			<Animated.View
				testID={testID}
				// The step we are on, whether it is open, failed or stopped there.
				aria-selected={state === 'current' || state === 'failed' || state === 'stopped'}
				aria-label={label}
				className="relative"
				style={[{ width: geometry.node, height: geometry.node }, shakeStyle]}
			>
				<Animated.View
					aria-hidden
					className={cn('border-border absolute rounded-full border-2', surfaceClassName)}
					style={[
						{
							width: geometry.bead,
							height: geometry.bead,
							top: (geometry.node - geometry.bead) / 2,
							left: (geometry.node - geometry.bead) / 2,
						},
						beadStyle,
					]}
				/>
				<Animated.View
					aria-hidden
					className={cn(
						'absolute inset-0 overflow-hidden rounded-full border-2',
						surfaceClassName,
						border
					)}
					style={badgeStyle}
				>
					<Animated.View
						className={cn('absolute rounded-full', tone)}
						style={[
							{
								width: geometry.core,
								height: geometry.core,
								top: (geometry.node - 4 - geometry.core) / 2,
								left: (geometry.node - 4 - geometry.core) / 2,
							},
							coreStyle,
						]}
					/>
					<Animated.View className={cn('absolute inset-0 rounded-full', tone)} style={faceStyle} />
					<Animated.View className="absolute inset-0 items-center justify-center" style={markStyle}>
						<Icon name={icon} className={cn(markTone, geometry.mark)} />
					</Animated.View>
				</Animated.View>
			</Animated.View>
			{size === 'compact' ? null : (
				<>
					<Text className={cn('mt-2 text-center font-medium', geometry.label, labelTone)}>
						{label}
					</Text>
					{caption ? (
						<Text className="text-muted-foreground text-center text-xs tabular-nums">
							{caption}
						</Text>
					) : null}
				</>
			)}
		</View>
	);
}
