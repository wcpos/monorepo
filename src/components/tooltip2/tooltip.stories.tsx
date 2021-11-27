import * as React from 'react';
import { View } from 'react-native';
import { StoryWrapper } from '@storybook/addons';
import { action } from '@storybook/addon-actions';
import Text from '../text';
import Icon from '../icon';
import Portal from '../portal';

import { Tooltip, TooltipProps } from './tooltip';

/**
 * Tooltips require
 * - Portals
 */
const AppProvider: StoryWrapper = (Story, context) => {
	return (
		<Portal.Provider>
			<Story {...context} />
			<Portal.Manager />
		</Portal.Provider>
	);
};

export default {
	title: 'Components/Tooltip2',
	component: Tooltip,
	decorators: [AppProvider],
};

export const BasicUsage = (props: TooltipProps) => (
	<View style={{ padding: 50, alignItems: 'flex-start' }}>
		<Tooltip {...props}>
			<Text>This is some unclear text.</Text>
		</Tooltip>
	</View>
);
BasicUsage.args = {
	content: 'Here is some very important clarification!',
};
