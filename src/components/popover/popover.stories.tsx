import React from 'react';
import Button from '../button';
import Text from '../text';
import Portal from '../portal';

import { storiesOf } from '@storybook/react';

import Popover from './';

storiesOf('Popover', module)
	/**
	 *
	 */
	.add('basic usage', () => (
		<Portal.Host>
			<Popover content={<Text>This is the popover</Text>}>
				<Button>Toggle Popover</Button>
			</Popover>
		</Portal.Host>
	));
