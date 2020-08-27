import React from 'react';
import { View } from 'react-native';
import Button from '../button';
import Text from '../text';
import Portal from '../portal';

import Popover from '.';

export default {
	title: 'Component/Popover',
};

export const basicUsage = () => (
	<Portal.Host>
		<View style={{ padding: 20 }}>
			<Popover content={<Text>This is the popover</Text>}>
				<Button>Toggle Popover</Button>
			</Popover>
		</View>
	</Portal.Host>
);
