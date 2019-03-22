import React from 'react';

import { storiesOf } from '@storybook/react';
import { action } from '@storybook/addon-actions';
import { withInfo } from '@storybook/addon-info';
import { withKnobs } from '@storybook/addon-knobs';

import Dimmer from './';

storiesOf('Dimmer', module)
	.addDecorator(withKnobs)
	.addDecorator(withInfo)

	/**
	 * Dimmer
	 */
	.add('basic usage', () => <Dimmer />);
