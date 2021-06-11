import _ from 'lodash';
import * as React from 'react';
import { LayoutRectangle, ViewProps, StyleProp, ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppProviderDimensions } from '@wcpos/common/src/hooks/use-position-in-app';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { PopoverPlacement, isLeft, isRight, isStart, isEnd, isTop, isBottom } from './placements';
import * as Styled from './styles';

// const { zIndex } = shameStyles.popover;

export interface PopoverViewProps {
	open: boolean;
	children: React.ReactNode;
	placement: PopoverPlacement;
	activatorLayout: LayoutRectangle;
	matchWidth: boolean;
	aboveActivator: boolean;
	clickThrough: boolean;
	style?: StyleProp<ViewStyle>;
}

/**
 * Actual Popover View which is displayed.
 */
export const PopoverView: React.FC<PopoverViewProps> = ({
	open,
	children,
	placement,
	activatorLayout,
	matchWidth,
	aboveActivator,
	clickThrough,
	style,
}) => {
	const { width: windowWidth, height: windowHeight } = useAppProviderDimensions();
	const [layout, setLayout] = React.useState<LayoutRectangle | null>(null);
	const onLayout = React.useCallback<Required<ViewProps>['onLayout']>(
		({ nativeEvent }) => setLayout(nativeEvent.layout),
		[setLayout]
	);

	// Calculate the offset of the Popover relative to parent according to placement
	const placementOffset = usePlacementOffset(placement, aboveActivator, layout, activatorLayout);

	// Corrects the placement to be inside window bounds
	const correctedPlacementOffset = useOffsetsCorrectionToBeInWindow(
		placementOffset,
		layout,
		windowWidth,
		windowHeight
	);

	// Fade in and out
	const opacity = useSharedValue(0);
	const animatedStyle = useAnimatedStyle(() => ({
		opacity: withTiming(opacity.value, { duration: 150 }),
	}));
	React.useEffect(() => {
		opacity.value = open ? 1 : 0;
	}, [open]);

	return (
		<Styled.Container
			as={Animated.View}
			style={[{ width: windowWidth, height: windowHeight }, animatedStyle]}
			pointerEvents="box-none" // Children views can receive touches but not this View
		>
			<Styled.Popover
				style={[
					layout === null
						? { opacity: 0 } // Hide Popover as long as we don't have its correct layout
						: {
								// Offset Popover to display correctly according to activator position and window bounds
								transform: [
									{ translateY: correctedPlacementOffset.y },
									{ translateX: correctedPlacementOffset.x },
								],
						  },
					{ maxWidth: windowWidth, maxHeight: windowHeight }, // Set max dimensions to prevent going out of Window
					matchWidth ? { width: activatorLayout.width } : null,
					// @ts-ignore
					style,
				]}
				onLayout={onLayout}
				pointerEvents={open && !clickThrough ? 'auto' : 'none'} // Make sure we can't click items if popover is closed or if clickthrough === true
			>
				{children}
			</Styled.Popover>
		</Styled.Container>
	);
};

/**
 * Get the offset of the Popover View according to its placement.
 *
 * Ignores Window bounds, this is the ideal position calculation.
 */
const usePlacementOffset = (
	placement: PopoverPlacement,
	aboveActivator: boolean,
	popoverLayout: LayoutRectangle | null,
	activatorLayout: LayoutRectangle
): Offset =>
	React.useMemo(() => {
		const offset = {
			x:
				activatorLayout.x +
				(isLeft(placement)
					? -(popoverLayout?.width ?? 0)
					: isRight(placement)
					? activatorLayout.width
					: isStart(placement)
					? 0
					: isEnd(placement)
					? -(popoverLayout?.width ?? 0) + activatorLayout.width
					: (activatorLayout.width - (popoverLayout?.width ?? 0)) / 2), // Top or bottom centered
			y:
				activatorLayout.y +
				(isTop(placement)
					? -(popoverLayout?.height ?? 0)
					: isBottom(placement)
					? activatorLayout?.height ?? 0
					: isStart(placement)
					? 0
					: isEnd(placement)
					? -(popoverLayout?.height ?? 0) + activatorLayout.height
					: (activatorLayout.height - (popoverLayout?.height ?? 0)) / 2), // Left or right centered
		};

		if (aboveActivator) {
			// Offset to be above activator
			if (isTop(placement)) {
				offset.y += activatorLayout.height;
			} else if (isBottom(placement)) {
				offset.y -= activatorLayout.height;
			} else if (isLeft(placement)) {
				offset.x += activatorLayout.width;
			} else {
				offset.x -= activatorLayout.width;
			}
		}

		return offset;
	}, [placement, aboveActivator, popoverLayout, activatorLayout]);

/**
 * Corrects the ideal Popover offset to prevent crossing View bounds.
 */
const useOffsetsCorrectionToBeInWindow = (
	offset: Offset,
	popoverLayout: LayoutRectangle | null,
	windowWidth: number,
	windowHeight: number
): Offset => {
	const insets = useSafeAreaInsets();

	return React.useMemo(() => {
		if (popoverLayout === null) {
			return offset;
		}

		return {
			x: _.clamp(
				offset.x,
				insets.left,
				windowWidth - popoverLayout.width - insets.left - insets.right
			),
			y: _.clamp(
				offset.y,
				insets.top,
				windowHeight - popoverLayout.height - insets.top - insets.bottom
			),
		};
	}, [popoverLayout, offset, windowWidth, windowHeight, insets]);
};

interface Offset {
	x: number;
	y: number;
}
