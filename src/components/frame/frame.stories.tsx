import React from 'react';

import { storiesOf } from '@storybook/react';
import { action } from '@storybook/addon-actions';
import { withInfo } from '@storybook/addon-info';
import { withKnobs } from '@storybook/addon-knobs';

import Frame from './';

storiesOf('Frame', module)
	.addDecorator(withKnobs)
	.addDecorator(withInfo)

	/**
	 * Frame
	 */
	.add('basic usage', () => <Frame />);
