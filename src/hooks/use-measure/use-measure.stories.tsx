import React, { useState } from 'react';
import { View } from 'react-native';
import Text from '../../components/text';

import { storiesOf } from '@storybook/react';

import useMeasure from './';

const MyComponent = () => {
	const [measurements, onMeasure] = useState({
		height: 0,
		pageX: 0,
		pageY: 0,
		width: 0,
		x: 0,
		y: 0,
	});
	const ref = React.useRef<View>(null);
	const { onLayout } = useMeasure({ onMeasure, ref });

	return (
		<View onLayout={onLayout} ref={ref}>
			<Text>height: {measurements.height}</Text>
			<Text>pageX: {measurements.pageX}</Text>
			<Text>pageY: {measurements.pageY}</Text>
			<Text>width: {measurements.width}</Text>
			<Text>x: {measurements.x}</Text>
			<Text>y: {measurements.y}</Text>
		</View>
	);
};

storiesOf('useMeasure', module)
	/**
	 *
	 */
	.add('basic usage', () => {
		const paddingLeft = Math.floor(Math.random() * 100 + 1);
		const paddingTop = Math.floor(Math.random() * 100 + 1);

		return (
			<View style={{ paddingLeft, paddingTop }}>
				<MyComponent />
			</View>
		);
	});
