import * as React from 'react';
import { View } from 'react-native';
import { action } from '@storybook/addon-actions';
import Text from '../text';
import Portal from '../portal';

import Tooltip from '.';

export default {
	title: 'Components/Tooltip',
};

export const basicUsage = () => (
	<Portal.Host>
		<View style={{ padding: '50px' }}>
			<Tooltip text="This is the tip!">
				<Text>Tooltip</Text>
			</Tooltip>
		</View>
	</Portal.Host>
);
