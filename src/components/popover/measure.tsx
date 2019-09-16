import React from 'react';
import useMeasure from '../../hooks/use-measure';

const Measure: React.FunctionComponent<Props> = ({ children, onMeasure, ref }) => {
	const { onMeasure, children, ...viewProps } = props;
	const isRenderProp = typeof children === 'function';
	const ref = React.useRef<View>(null);
	const { measurements, onLayout } = useMeasure({ onMeasure, ref });

	return children;
};
