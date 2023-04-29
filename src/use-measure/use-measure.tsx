import * as React from 'react';
import { Dimensions } from 'react-native';

import defaults from 'lodash/defaults';
import Animated, {
	useDerivedValue,
	useAnimatedRef,
	measure,
	MeasuredDimensions,
	useSharedValue,
} from 'react-native-reanimated';

// Animated.addWhitelistedNativeProps({ onLayout: true });

export interface UseMeasureProps {
	onMeasure?: (measurements: MeasuredDimensions) => void;
	initialMeasurements?: MeasuredDimensions;
}

export interface UseMeasureResult {
	animatedRef: React.MutableRefObject<React.Component<any, any> | null>;
	measurements: Animated.SharedValue<MeasuredDimensions | null>;
	forceMeasure: () => void;
	MeasureWrapper: (props: React.ComponentProps<typeof Animated.View>) => JSX.Element;
}

/**
 * A custom hook to measure a component by providing a `MeasureWrapper` and an `animatedRef`.
 * It returns the measurements as a shared value, which updates whenever the component layout changes.
 * The `forceMeasure` function can be used to manually trigger a measurement update.
 * Optionally, you can provide initial measurements or an `onMeasure` callback for additional actions.
 */
export const useMeasure = ({
	onMeasure,
	initialMeasurements,
}: UseMeasureProps = {}): UseMeasureResult => {
	const animatedRef = useAnimatedRef();
	const defaultInitialMeasurements = {
		height: 0,
		width: 0,
		x: 0,
		y: 0,
		pageX: 0,
		pageY: 0,
	};
	const measurements = useSharedValue<MeasuredDimensions | null>(
		defaults(initialMeasurements, defaultInitialMeasurements)
	);

	/**
	 *
	 */
	useDerivedValue(() => {
		if (animatedRef.current) {
			requestAnimationFrame(() => {
				const measured = measure(animatedRef);
				if (measured !== null && !isEqual(measured, measurements.value)) {
					measurements.value = measured;
					onMeasure && onMeasure(measured);
				}
			});
		}
	});

	/**
	 *
	 */
	const forceMeasure = React.useCallback(() => {
		if (animatedRef.current) {
			requestAnimationFrame(() => {
				const measured = measure(animatedRef);
				if (measured !== null && !isEqual(measured, measurements.value)) {
					measurements.value = measured;
					onMeasure && onMeasure(measured);
				}
			});
		}
	}, [animatedRef, onMeasure, measurements]);

	/**
	 * Subscribe to dimension changes to force measure
	 */
	React.useEffect(() => {
		// forceMeasure();
		const dimensionsSubscription = Dimensions.addEventListener('change', forceMeasure);
		return () => {
			dimensionsSubscription.remove();
		};
	}, [forceMeasure]);

	/**
	 *
	 */
	return {
		animatedRef,
		measurements,
		forceMeasure,
		MeasureWrapper: (props) => (
			<Animated.View ref={animatedRef} onLayout={forceMeasure} {...props} />
		),
	};
};

// Helper function to check if two measurement objects are equal
function isEqual(a: MeasuredDimensions | null, b: MeasuredDimensions | null): boolean {
	if (!a || !b) return false;
	return (
		a.height === b.height &&
		a.pageX === b.pageX &&
		a.pageY === b.pageY &&
		a.width === b.width &&
		a.x === b.x &&
		a.y === b.y
	);
}
