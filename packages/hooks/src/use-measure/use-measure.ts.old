import React from 'react';
import { Dimensions, LayoutChangeEvent, LayoutRectangle, Platform } from 'react-native';

import { useSharedValue } from 'react-native-reanimated';

export interface Measurements {
	height: number;
	pageX: number;
	pageY: number;
	width: number;
	x: number;
	y: number;
}

export interface UseMeasureProps {
	onMeasure?: (props: Measurements) => void;
	ref: React.MutableRefObject<any>;
	initial?: Measurements;
}

export const initialMeasurements = {
	height: 0,
	// pageX: -1000,
	// pageY: -1000,
	pageX: 100,
	pageY: 100,
	width: 0,
	x: 0,
	y: 0,
};

const adjustPageY = (pageY: number) => {
	// On the web, when scroll position is restored (e.g. User is scrolled down and refreshes the page)
	// We need to adjust pageY accordingly. Required to correct behavior of positioner
	return Platform.OS === 'web' ? pageY + window.scrollY : pageY;
};

/**
 * A render prop to measure given node by passing `onLayout` and `ref` handlers.
 * This differs from `ViewMeasure` in that it does not create any node in the tree
 */
export const useMeasure = ({ onMeasure, ref, initial = initialMeasurements }: UseMeasureProps) => {
	const measurements = useSharedValue(initial);

	const handleMeasure = React.useCallback(
		(layout?: LayoutRectangle) => {
			const prevMeasurements = measurements.value;
			ref.current?.measure((x, y, width, height, pageX, pageY) => {
				const newMeasurements = {
					...prevMeasurements,
					...layout,
					pageX,
					pageY: adjustPageY(pageY),
				};

				measurements.value = newMeasurements;

				if (onMeasure) onMeasure(newMeasurements);
			});
		},
		[measurements, onMeasure, ref]
	);

	const handleLayout = React.useCallback(
		(e: LayoutChangeEvent) => {
			// Use the value from here, isntead of inside UIManager.measure callback
			// Async behavior will nullify nativeEvent
			const { layout } = e.nativeEvent;
			handleMeasure(layout);
		},
		[handleMeasure]
	);

	const handleResize = React.useCallback(() => {
		handleMeasure();
	}, [handleMeasure]);

	React.useEffect(() => {
		Dimensions.addEventListener('change', handleResize);

		// return () => Dimensions.removeEventListener('change', handleResize);
	}, [handleResize, measurements]);

	return {
		measurements,
		onLayout: handleLayout,
		forceMeasure: handleMeasure,
	};
};
