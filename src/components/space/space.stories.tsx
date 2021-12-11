import React from 'react';
import Text from '../text';
import Box from '../box';
import { Space, SpaceProps } from './space';

export default {
	title: 'Components/Space',
	component: Space,
};

export const BasicUsage = (props: SpaceProps) => (
	<Box horizontal>
		<Text>Test1</Text>
		<Space {...props} />
		<Text>Test2</Text>
	</Box>
);
