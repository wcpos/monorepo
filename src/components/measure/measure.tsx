import * as React from 'react';
import { View } from 'react-native';
import useMeasure from '../../hooks/use-measure';

type Measurements = import('../../hooks/use-measure/use-measure').Measurements;
type MeasureRenderProp = (props: Measurements) => React.ReactElement;

interface Props {
	children: React.ReactElement | MeasureRenderProp;
	onMeasure: (props: Measurements) => void;
}

const Measure = ({ children, onMeasure }: Props) => {
	const ref = React.useRef<any>();
	const { measurements, onLayout } = useMeasure({ onMeasure, ref });
	const isRenderProp = typeof children === 'function';

	if (isRenderProp) {
		return (
			<View ref={ref} onLayout={onLayout}>
				{children(measurements)}
			</View>
		);
	}

	return React.cloneElement(children, { ref, onLayout });
};

export default Measure;
