import * as React from 'react';

import Animated, {
	cancelAnimation,
	Easing,
	ReduceMotion,
	useAnimatedStyle,
	useSharedValue,
	withRepeat,
	withSequence,
	withTiming,
} from 'react-native-reanimated';

import { Platform } from '@wcpos/utils/platform';

import { SPINNER } from '../lib/motion';

const TURN = {
	duration: SPINNER,
	easing: Easing.linear,
	reduceMotion: ReduceMotion.Never,
};

/**
 * The Loader's own class, not the bare utility: global.css zeroes every animation under
 * `prefers-reduced-motion` EXCEPT nodes carrying `web:animate-spin` or `web:animate-indeterminate`,
 * the functional waits (the motion registry's `spinner` is exempt). The bare `animate-spin` would
 * leave a reduced-motion user with no sign that a sync is running (Codex review).
 */
const SPIN_CLASS = 'web:animate-spin';

const FULL_TURN_DEGREES = 360;
/** The rest of a turn, at the registry's speed: how long the glyph still needs to come upright. */
const restOfTurn = (degrees: number) => (SPINNER * degrees) / FULL_TURN_DEGREES;
/** A zero-length step inside a sequence (the reset to 0 between a finished turn and the laps). */
const INSTANT = 0;

/**
 * Turns its child in place while `active`, and stops it upright: the turn in progress finishes
 * before the glyph rests, so it never jumps back from mid-turn when the work ends. One
 * revolution a second, linear: the motion registry's `spinner` (a functional wait, exempt from
 * reduce-motion, as the Loader is).
 *
 * Native drives the rotation on the UI thread (Reanimated), so it keeps turning while the JS
 * thread is busy, which is exactly when a sync glyph is spinning. Web keeps the CSS animation
 * for the same reason (loader LEDGER line 2: Reanimated on web is JS-driven and stutters under
 * load), toggled on the node itself so no render is needed to end it, and takes it off on the
 * animation's iteration boundary, where the glyph is upright again.
 */
export function Spin({ active, children }: { active: boolean; children: React.ReactNode }) {
	const rotation = useSharedValue(0);
	const ref = React.useRef<React.ElementRef<typeof Animated.View> | null>(null);

	React.useEffect(() => {
		if (Platform.isNative) {
			if (active) {
				const spin = withRepeat(
					withTiming(FULL_TURN_DEGREES, TURN),
					-1,
					false,
					undefined,
					ReduceMotion.Never
				);
				// Started again mid-turn (the finishing turn below was still running): finish that
				// turn first and restart the laps from 0. `withRepeat` takes the value it starts at
				// as every lap's start, so a repeat begun at 270 would play 270→360 over and over
				// and jump back each lap (Codex review).
				const from = rotation.value % FULL_TURN_DEGREES;
				// Every step exempt from reduce-motion, the reset included: a reduced-motion sequence
				// skips an intermediate step WITHOUT landing on its destination, so an unexempt reset
				// left the repeat starting at 360 and every lap 360→360 (Codex review).
				rotation.value =
					from === 0
						? spin
						: withSequence(
								ReduceMotion.Never,
								withTiming(FULL_TURN_DEGREES, {
									...TURN,
									duration: restOfTurn(FULL_TURN_DEGREES - from),
								}),
								withTiming(0, { duration: INSTANT, reduceMotion: ReduceMotion.Never }),
								spin
							);
				return () => cancelAnimation(rotation);
			}
			// Finish the turn at the same speed, then rest at 0. A glyph that never turned stays.
			const rest = FULL_TURN_DEGREES - (rotation.value % FULL_TURN_DEGREES);
			if (rest === FULL_TURN_DEGREES) return;
			rotation.value = withTiming(
				rotation.value + rest,
				{ ...TURN, duration: restOfTurn(rest) },
				(finished) => {
					if (finished) rotation.value = 0;
				}
			);
			return () => cancelAnimation(rotation);
		}
		const node = ref.current as unknown as HTMLElement | null;
		if (!node?.classList) return;
		if (active) {
			node.classList.add(SPIN_CLASS);
			return;
		}
		if (!node.classList.contains(SPIN_CLASS)) return;
		// The class comes off at the next iteration boundary (the glyph upright). A node that is
		// not animating (hidden) fires no iteration, so one turn's wait ends it regardless.
		const stop = () => node.classList.remove(SPIN_CLASS);
		const timer = setTimeout(stop, SPINNER);
		node.addEventListener('animationiteration', stop);
		return () => {
			clearTimeout(timer);
			node.removeEventListener('animationiteration', stop);
		};
	}, [active, rotation]);

	const style = useAnimatedStyle(() => ({ transform: [{ rotate: `${rotation.value}deg` }] }));

	return (
		<Animated.View ref={ref} className="size-full" style={Platform.isNative ? style : undefined}>
			{children}
		</Animated.View>
	);
}
