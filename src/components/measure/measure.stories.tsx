import * as React from 'react';
import { View } from 'react-native';
import Text from '../text';

import Measure from '.';

export default {
	title: 'Components/Measure',
};

export const basicUsage = () => {
	const [measurements, onMeasure] = React.useState();

	return (
		<View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
			<Measure onMeasure={onMeasure}>
				<View>
					<Text>
						height:
						{measurements?.height}
					</Text>
					<Text>
						pageX:
						{measurements?.pageX}
					</Text>
					<Text>
						pageY:
						{measurements?.pageY}
					</Text>
					<Text>
						width:
						{measurements?.width}
					</Text>
					<Text>
						x:
						{measurements?.x}
					</Text>
					<Text>
						y:
						{measurements?.y}
					</Text>
				</View>
			</Measure>
		</View>
	);
};
