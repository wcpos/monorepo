import React from 'react';
import { View } from 'react-native';
import Text from '../text';
import Portal from '../portal';

import { storiesOf } from '@storybook/react';
import { action } from '@storybook/addon-actions';

import Tooltip from './';

storiesOf('Tooltip', module)
	/**
	 *
	 */
	.add('basic usage', () => (
		<Portal.Host>
			<View style={{ padding: '50px' }}>
				<Tooltip text="This is the tip!">
					<Text>Tooltip</Text>
				</Tooltip>
			</View>
		</Portal.Host>
	));
