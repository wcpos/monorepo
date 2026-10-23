import * as React from 'react';

import Animated, {
	cancelAnimation,
	Easing,
	ReduceMotion,
	useAnimatedStyle,
	useSharedValue,
	withRepeat,
	withTiming,
} from 'react-native-reanimated';

import { Platform } from '@wcpos/utils/platform';

import { SPINNER } from '../lib/motion';

const TURN = {
	duration: SPINNER,
	easing: Easing.linear,
	reduceMotion: ReduceMotion.Never,
};

/** Tailwind's one-revolution-a-second utility; the Loader's `web:animate-spin` is the same keyframes. */
const SPIN_CLASS = 'animate-spin';

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
				rotation.value = withRepeat(
					withTiming(360, TURN),
					-1,
					false,
					undefined,
					ReduceMotion.Never
				);
				return () => cancelAnimation(rotation);
			}
			// Finish the turn at the same speed, then rest at 0. A glyph that never turned stays.
			const rest = 360 - (rotation.value % 360);
			if (rest === 360) return;
			rotation.value = withTiming(
				rotation.value + rest,
				{ ...TURN, duration: (SPINNER * rest) / 360 },
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
