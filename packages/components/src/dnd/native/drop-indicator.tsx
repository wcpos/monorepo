import * as React from 'react';
import { View, type ViewStyle } from 'react-native';

import Animated, { useAnimatedStyle, withSpring } from 'react-native-reanimated';

type Edge = 'top' | 'bottom' | 'left' | 'right';

interface DropIndicatorProps {
	edge: Edge;
	gap: number;
}

const INDICATOR_COLOR = '#2563eb'; // blue-600
const INDICATOR_THICKNESS = 2;
const DOT_SIZE = 8;

/**
 * Visual indicator showing where a dragged item will be dropped
 */
export function DropIndicator({ edge, gap }: DropIndicatorProps) {
	const isHorizontal = edge === 'top' || edge === 'bottom';

	// Calculate offset to position indicator between items
	const lineOffset = -(gap / 2 + INDICATOR_THICKNESS / 2);

	const baseStyle: ViewStyle = {
		position: 'absolute',
		backgroundColor: INDICATOR_COLOR,
		zIndex: 10,
	};

	const lineStyle: ViewStyle = isHorizontal
		? {
				height: INDICATOR_THICKNESS,
				left: 4,
				right: 0,
				...(edge === 'top' ? { top: lineOffset } : { bottom: lineOffset }),
			}
		: {
				width: INDICATOR_THICKNESS,
				top: 4,
				bottom: 0,
				...(edge === 'left' ? { left: lineOffset } : { right: lineOffset }),
			};

	const dotStyle: ViewStyle = {
		position: 'absolute',
		width: DOT_SIZE,
		height: DOT_SIZE,
		borderRadius: DOT_SIZE / 2,
		borderWidth: 2,
		borderColor: INDICATOR_COLOR,
		backgroundColor: 'transparent',
		...(isHorizontal
			? {
					left: -8,
					top: -(DOT_SIZE / 2 - INDICATOR_THICKNESS / 2),
				}
			: {
					top: -8,
					left: -(DOT_SIZE / 2 - INDICATOR_THICKNESS / 2),
				}),
	};

	const animatedStyle = useAnimatedStyle(() => ({
		opacity: withSpring(1, { damping: 20, stiffness: 300 }),
	}));

	return (
		<Animated.View style={[baseStyle, lineStyle, animatedStyle]}>
			<View style={dotStyle} />
		</Animated.View>
	);
}
