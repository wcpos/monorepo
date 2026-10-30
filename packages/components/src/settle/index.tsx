import * as React from 'react';

import Animated, {
	useAnimatedStyle,
	useReducedMotion,
	useSharedValue,
	withTiming,
} from 'react-native-reanimated';

import { BEAT, EASE_BEAT } from '../lib/motion';
import { useThemeTraits } from '../lib/theme-traits';

/** One landing when the total changes, never a count-up or a mount animation. */
export function Settle({ value, children }: { value: unknown; children: React.ReactElement }) {
	const { settle } = useThemeTraits();
	const reduced = useReducedMotion();
	const previous = React.useRef(value);
	const y = useSharedValue(0);
	const opacity = useSharedValue(1);
	React.useEffect(() => {
		const changed = !Object.is(previous.current, value);
		previous.current = value;
		if (!changed || !settle || reduced) return;
		y.value = 5;
		opacity.value = 0.4;
		y.value = withTiming(0, { duration: BEAT, easing: EASE_BEAT });
		opacity.value = withTiming(1, { duration: BEAT, easing: EASE_BEAT });
	}, [value, settle, reduced, y, opacity]);
	const style = useAnimatedStyle(() => ({
		transform: [{ translateY: y.value }],
		opacity: opacity.value,
	}));
	return settle && !reduced ? <Animated.View style={style}>{children}</Animated.View> : children;
}
