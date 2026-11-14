import * as React from 'react';
import type { ViewProps } from 'react-native';

import Animated, {
	Easing,
	Extrapolation,
	interpolate,
	ReduceMotion,
	useAnimatedStyle,
	useSharedValue,
	withSequence,
	withSpring,
	withTiming,
} from 'react-native-reanimated';

import { BEAT, COUNT_FADE, COUNT_SWELL, EASE } from '../lib/motion';
import { cn } from '../lib/utils';
import { Text } from '../text';

/**
 * How the number changes hands inside the badge.
 * - `bounce`: the old number fades where it sits and the new one rides the badge's own
 *   spring, so number and badge land as one (owner's pick, 2026-10-02).
 * - `roll`: the new number rolls in over the old one, up for an add and down for a removal.
 */
export type CountMotion = 'bounce' | 'roll';
export const COUNT_MOTION: CountMotion = 'bounce';

// The landing: a count that goes up swells the badge in a few frames, then a loose spring
// lets it go. It dips under its own size and settles (about 1.3 → 0.92 → 1 over half a
// second). Both legs start from wherever the badge is, so a change that lands mid-bounce
// carries on from there.
const SWELL = 1.3;
const SWELL_TIMING = { duration: COUNT_SWELL, easing: EASE, reduceMotion: ReduceMotion.System };
const SETTLE = { stiffness: 380, damping: 11, mass: 0.6, reduceMotion: ReduceMotion.System };
// It grows taller than it grows wide, and dips shorter than narrow: soft, not a rigid zoom.
const SIDEWAYS = 0.55;
const ROLL = { duration: BEAT, easing: EASE, reduceMotion: ReduceMotion.System };
// `bounce`: the old number is gone before the swell peaks and the new one arrives at the
// peak, so there is a number on the badge for the whole way down.
const FADE = { duration: COUNT_FADE, easing: Easing.linear, reduceMotion: ReduceMotion.System };
const WAS_GONE_BY = 0.45;
const NOW_FADES_IN = [0.3, 0.8];
// The new number overshoots a touch further than the badge that carries it.
const NUMBER_BOUNCE = 1.2;

type Seen = {
	identity: string;
	text: string | null;
	value: number;
	wasText: string | null;
	added: boolean;
	beat: number;
};

/**
 * The beat a count badge plays when its number changes under the user's hand: the number
 * changes hands (see `CountMotion`) and, when the count went up, the badge swells and
 * bounces back. Only `transform` and `opacity` animate.
 *
 * The hook has to outlive the badge's hidden state to see the first count arrive, so call
 * it from a component that stays mounted and pass `text: null` while nothing shows.
 * Nothing moves on mount, and nothing moves when `identity` changes: a different thing
 * being counted is not a change in the count.
 */
export function useCountBeat({
	value,
	text,
	identity = '',
	motion = COUNT_MOTION,
}: {
	/** The count itself: which way it moved decides whether the badge lands. */
	value: number;
	/** What the badge reads, or `null` while it shows nothing. */
	text: string | null;
	/** What is being counted. */
	identity?: string;
	motion?: CountMotion;
}) {
	const [seen, setSeen] = React.useState<Seen>({
		identity,
		text,
		value,
		wasText: text,
		added: false,
		beat: 0,
	});
	if (seen.identity !== identity) {
		setSeen({ identity, text, value, wasText: text, added: false, beat: 0 });
	} else if (seen.text !== text) {
		setSeen({
			identity,
			text,
			value,
			wasText: seen.text,
			added: value > seen.value,
			beat: seen.beat + 1,
		});
	} else if (seen.value !== value) {
		// The count moved behind a cap ("99+"): nothing on the badge changed.
		setSeen({ ...seen, value });
	}

	const pop = useSharedValue(1);
	const change = useSharedValue(1);
	const direction = useSharedValue(1);
	const rolls = motion === 'roll';

	const { beat, added, identity: shownIdentity } = seen;
	const shows = seen.text !== null;
	// Before paint: the new number must not be seen in place before it arrives.
	React.useLayoutEffect(() => {
		if (beat === 0) {
			// A different thing is being counted: a bounce still running belongs to the last one.
			// Assigning a plain value stops the animation where it is.
			pop.value = 1;
			change.value = 1;
			return;
		}
		if (shows === false) return;
		direction.value = added ? 1 : -1;
		change.value = 0;
		change.value = withTiming(1, rolls ? ROLL : FADE);
		if (added) {
			pop.value = withSequence(withTiming(SWELL, SWELL_TIMING), withSpring(1, SETTLE));
		}
		// Keyed on the beat, not on `seen`: a count that moves behind a cap ("99+") stores a new
		// value and must not replay the last beat.
	}, [beat, shownIdentity, shows, added, rolls, direction, pop, change]);

	const popStyle = useAnimatedStyle(() => ({
		transform: [{ scaleX: 1 + (pop.value - 1) * SIDEWAYS }, { scaleY: pop.value }],
	}));
	const nowStyle = useAnimatedStyle(() =>
		rolls
			? {
					opacity: change.value,
					transform: [{ translateY: `${(1 - change.value) * direction.value * 100}%` }],
				}
			: {
					opacity: interpolate(change.value, NOW_FADES_IN, [0, 1], Extrapolation.CLAMP),
					transform: [{ scale: 1 + (pop.value - 1) * NUMBER_BOUNCE }],
				}
	);
	const wasStyle = useAnimatedStyle(() =>
		rolls
			? {
					opacity: 1 - change.value,
					transform: [{ translateY: `${-change.value * direction.value * 100}%` }],
				}
			: { opacity: interpolate(change.value, [0, WAS_GONE_BY], [1, 0], Extrapolation.CLAMP) }
	);

	return { wasText: seen.wasText, rolls, popStyle, nowStyle, wasStyle };
}

/** The badge a `useCountBeat` drives: `className` is the pill, `textClassName` its number. */
export function BeatingCount({
	beat,
	text,
	className,
	textClassName,
	style,
	...props
}: ViewProps & {
	beat: ReturnType<typeof useCountBeat>;
	text: string;
	textClassName?: string;
}) {
	return (
		<Animated.View
			// A roll leaves through the badge's edge; a bounce must be free to overshoot it.
			className={cn('items-center justify-center', beat.rolls && 'overflow-hidden', className)}
			style={[beat.popStyle, style]}
			{...props}
		>
			{beat.wasText !== null && beat.wasText !== text && (
				<Animated.View
					aria-hidden
					className="absolute inset-0 items-center justify-center"
					style={beat.wasStyle}
				>
					<Text className={textClassName}>{beat.wasText}</Text>
				</Animated.View>
			)}
			<Animated.View style={beat.nowStyle}>
				<Text className={textClassName}>{text}</Text>
			</Animated.View>
		</Animated.View>
	);
}
