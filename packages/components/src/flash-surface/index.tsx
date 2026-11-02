import * as React from 'react';

import Animated, {
	interpolateColor,
	useAnimatedStyle,
	useReducedMotion,
	useSharedValue,
	withTiming,
} from 'react-native-reanimated';
import { useCSSVariable } from 'uniwind';

import { EdgeSurface } from '../edge-surface';
import { EASE, PAID_FLASH_DURATION } from '../lib/motion';
import { useThemeTraits } from '../lib/theme-traits';
import { cn } from '../lib/utils';

const AnimatedSurface = Animated.createAnimatedComponent(EdgeSurface);
type Props = React.ComponentProps<typeof EdgeSurface>;

/** The receipt's selected tint releases to the card, without fading its contents. */
export function FlashSurface({ className, ...props }: Props) {
	const { paidFlash } = useThemeTraits();
	const reduced = useReducedMotion();
	const surface = cn('bg-card', className);
	return paidFlash && !reduced ? (
		<Flash {...props} className={surface} />
	) : (
		<EdgeSurface {...props} className={surface} />
	);
}

function Flash({ style, ...props }: Props) {
	const selected = useCSSVariable('--color-selected') as string;
	const card = useCSSVariable('--color-card') as string;
	const progress = useSharedValue(0);
	React.useEffect(() => {
		progress.value = withTiming(1, { duration: PAID_FLASH_DURATION, easing: EASE });
	}, [progress]);
	const animatedStyle = useAnimatedStyle(() => ({
		backgroundColor: interpolateColor(progress.value, [0, 1], [selected, card]),
	}));
	return <AnimatedSurface {...props} style={[style, animatedStyle]} />;
}
