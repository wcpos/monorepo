import * as React from 'react';

import Animated, {
	useDerivedValue,
	useAnimatedRef,
	measure,
	MeasuredDimensions,
} from 'react-native-reanimated';

export interface UseMeasureProps {
	onMeasure: (measurements: MeasuredDimensions) => void;
}

export interface UseMeasureResult {
	animatedRef: React.MutableRefObject<React.Component<any, any> | null>;
	MeasureWrapper: (props: React.ComponentProps<typeof Animated.View>) => JSX.Element;
	forceMeasure: () => void;
}

/**
 * A render prop to measure given node by passing `onLayout` and `ref` handlers.
 * This differs from `ViewMeasure` in that it does not create any node in the tree
 */
export const useMeasure = ({ onMeasure }: UseMeasureProps): UseMeasureResult => {
	const animatedRef = useAnimatedRef();

	useDerivedValue(() => {
		if (animatedRef.current) {
			requestAnimationFrame(() => {
				const measured = measure(animatedRef);
				if (measured !== null) {
					onMeasure(measured);
				} else {
					console.warn('measure: could not measure view');
				}
			});
		}
	});

	const forceMeasure = React.useCallback(() => {
		if (animatedRef.current) {
			requestAnimationFrame(() => {
				const measured = measure(animatedRef);
				if (measured !== null) {
					onMeasure(measured);
				} else {
					console.warn('measure: could not measure view');
				}
			});
		}
	}, [animatedRef, onMeasure]);

	return {
		animatedRef,
		forceMeasure,
		MeasureWrapper: (props) => <Animated.View ref={animatedRef} {...props} />,
	};
};
