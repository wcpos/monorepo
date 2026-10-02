import * as React from 'react';
import { Pressable, View } from 'react-native';

import Animated, {
	ReduceMotion,
	useAnimatedStyle,
	useSharedValue,
	withSequence,
	withSpring,
	withTiming,
} from 'react-native-reanimated';

import { BEAT, EASE } from '@wcpos/components/lib/motion';
import { Text } from '@wcpos/components/text';

import { useT } from '../../../../../../contexts/translations';
import { useCurrentOrder } from '../../../contexts/current-order';

// The landing: an add swells the badge in a few frames, then a loose spring lets it go. It
// dips under its own size and settles (about 1.3 → 0.92 → 1 over half a second). Both legs
// start from wherever the badge is, so an add that lands mid-bounce carries on from there.
const SWELL = 1.3;
const SWELL_TIMING = { duration: 90, easing: EASE, reduceMotion: ReduceMotion.System };
const SETTLE = { stiffness: 380, damping: 11, mass: 0.6, reduceMotion: ReduceMotion.System };
// It grows taller than it grows wide, and dips shorter than narrow: soft, not a rigid zoom.
const SIDEWAYS = 0.55;
const ROLL = { duration: BEAT, easing: EASE, reduceMotion: ReduceMotion.System };

type Seen = { identity: string; count: number; was: number; beat: number };

/**
 * How many of a product are in the cart. When the count changes under the cashier's hand the
 * new number rolls in over the old one, and an add lands: the badge swells and bounces back.
 * That is all of it (owner, 2026-10-01: a ring splashing out of the badge was too much).
 * Only `transform` and `opacity` animate.
 *
 * It stays mounted while the count is zero (rendering `empty`) so that it is there to see
 * the first add. A count that differs because the row was recycled for another product, or
 * because another order came into view, is not an add and nothing moves.
 */
export function InCartCount({
	product,
	count,
	onPress,
	empty = null,
}: {
	/** The product counted: the same product with a new count is a change worth showing. */
	product: string;
	count: number;
	onPress?: () => void;
	/** What stands in the badge's place while nothing is in the cart. */
	empty?: React.ReactNode;
}) {
	const t = useT();
	const { currentOrderRecord } = useCurrentOrder();
	const identity = `${currentOrderRecord?.uuid}:${product}`;
	const [seen, setSeen] = React.useState<Seen>({ identity, count, was: count, beat: 0 });
	if (seen.identity !== identity) setSeen({ identity, count, was: count, beat: 0 });
	else if (seen.count !== count) setSeen({ identity, count, was: seen.count, beat: seen.beat + 1 });

	const pop = useSharedValue(1);
	const roll = useSharedValue(1);
	const direction = useSharedValue(1);

	// Before paint: the new number must not be seen in place before it rolls in.
	React.useLayoutEffect(() => {
		if (seen.beat === 0) return;
		const added = seen.count > seen.was;
		direction.value = added ? 1 : -1;
		roll.value = 0;
		roll.value = withTiming(1, ROLL);
		if (added) pop.value = withSequence(withTiming(SWELL, SWELL_TIMING), withSpring(1, SETTLE));
	}, [seen, direction, pop, roll]);

	const popStyle = useAnimatedStyle(() => ({
		transform: [{ scaleX: 1 + (pop.value - 1) * SIDEWAYS }, { scaleY: pop.value }],
	}));
	const nowStyle = useAnimatedStyle(() => ({
		opacity: roll.value,
		transform: [{ translateY: `${(1 - roll.value) * direction.value * 100}%` }],
	}));
	const wasStyle = useAnimatedStyle(() => ({
		opacity: 1 - roll.value,
		transform: [{ translateY: `${-roll.value * direction.value * 100}%` }],
	}));

	if (count <= 0) return <>{empty}</>;

	const badge = (
		<View className="size-6">
			<Animated.View
				className="bg-primary size-6 items-center justify-center overflow-hidden rounded-full"
				style={popStyle}
			>
				{seen.was > 0 && seen.was !== count && (
					<Animated.View
						aria-hidden
						className="absolute inset-0 items-center justify-center"
						style={wasStyle}
					>
						<Text className="text-primary-foreground tabular-nums">{seen.was}</Text>
					</Animated.View>
				)}
				<Animated.View style={nowStyle}>
					<Text className="text-primary-foreground tabular-nums">{count}</Text>
				</Animated.View>
			</Animated.View>
		</View>
	);
	if (!onPress) {
		return <View accessibilityLabel={t('pos_products.in_cart_count', { count })}>{badge}</View>;
	}
	// Pressable when it stands in for the `+`: the badge is then the row's named add control,
	// and its target keeps the row token (the 44-pt floor) around the compact badge.
	return (
		<Pressable
			accessibilityRole="button"
			accessibilityLabel={t('pos_products.in_cart_count', { count })}
			onPress={onPress}
			hitSlop={8}
			className="min-h-row min-w-row items-center justify-center"
		>
			{badge}
		</Pressable>
	);
}
