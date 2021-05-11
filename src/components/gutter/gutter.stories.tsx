import * as React from 'react';
import { View } from 'react-native';
import { Gutter, GutterProps } from './gutter';

export default {
	title: 'Components/Gutter',
	component: Gutter,
};

export const BasicUsage = (props: GutterProps) => (
	<View style={{ width: '300px', height: '300px' }}>
		<Gutter {...props} />
	</View>
);
