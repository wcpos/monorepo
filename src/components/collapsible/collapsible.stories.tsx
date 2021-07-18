import * as React from 'react';
import { View } from 'react-native';
import { action } from '@storybook/addon-actions';
import { Collapsible, CollapsibleProps } from './collapsible';
import Text from '../text';

export default {
	title: 'Components/Collapsible',
	component: Collapsible,
};

const LOREM_IPSUM =
	'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.';

export const BasicUsage = (props: CollapsibleProps) => {
	const [open, setOpen] = React.useState(false);

	return (
		<View style={{ width: '400px' }}>
			<Text onPress={() => setOpen((prev) => !prev)}>Trigger</Text>
			<Collapsible {...props} open={open}>
				<Text>{LOREM_IPSUM}</Text>
			</Collapsible>
			<Text>Below</Text>
		</View>
	);
};
// BasicUsage.args = {
// 	open: false,
// };
BasicUsage.argTypes = {
	children: { control: null },
};
