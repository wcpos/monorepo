import * as React from 'react';
import { Animated, Easing } from 'react-native';
import useOnLayout from '@wcpos/common/src/hooks/use-on-layout';
import * as Styled from './styles';

export interface CollapsibleProps {
	/**
	 * Toggle the expanded state of the Collapsible.
	 */
	open: boolean;
	/**
	 * Content that should be collapsible.
	 */
	children: React.ReactNode;
}

const animation = {
	duration: {
		default: 300,
		shorter: 150,
		longer: 400,
	},
	easing: {
		enter: Easing.out(Easing.ease), // Ease out
		exit: Easing.ease, // Ease in
		move: Easing.inOut(Easing.ease), // Ease in-out
	},
};

/**
 * Make long sections of information available in a block that can expand or collapse.
 *
 * Should not wrap views with shadows, as shadow will be clipped.
 */
export const Collapsible = ({ open, children }: CollapsibleProps) => {
	const isFirstEffect = React.useRef(true);
	const [animating, setAnimating] = React.useState(false);
	const [anim] = React.useState(new Animated.Value(open ? 1 : 0));
	const [layout, onLayout] = useOnLayout();

	React.useEffect(() => {
		// Prevent animating the first effect (on mount)
		if (isFirstEffect.current) {
			isFirstEffect.current = false;
			return;
		}

		setAnimating(true);
		Animated.timing(anim, {
			toValue: open ? 1 : 0,
			duration: animation.duration.default,
			useNativeDriver: false,
			easing: animation.easing.move,
		}).start(({ finished }) => (finished ? setAnimating(false) : undefined));
	}, [open]);

	return (
		<Styled.Container
			as={Animated.View}
			style={[
				{
					opacity: anim,
					height: animating
						? anim.interpolate({ inputRange: [0, 1], outputRange: [0, layout?.height ?? 0] })
						: open || !layout
						? undefined
						: 0,
				},
			]}
			onLayout={animating || (!open && layout) ? undefined : onLayout}
		>
			{children}
		</Styled.Container>
	);
};
