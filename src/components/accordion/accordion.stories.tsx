import * as React from 'react';
import { View } from 'react-native';
import { Accordion, AccordionProps } from './accordion';
import Text from '../text';

export default {
	title: 'Components/Accordion',
	component: Accordion,
};

const LOREM_IPSUM =
	'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.';

export const BasicUsage = (props: AccordionProps) => (
	<View style={{ width: 300 }}>
		<Accordion {...props} />
	</View>
);
BasicUsage.args = {
	items: [
		{
			title: 'Label 1',
			content: <Text>{LOREM_IPSUM}</Text>,
		},
		{
			title: 'Label 2',
			content: <Text>{LOREM_IPSUM}</Text>,
		},
		{
			title: 'Label 3',
			content: <Text>{LOREM_IPSUM}</Text>,
		},
	],
};
