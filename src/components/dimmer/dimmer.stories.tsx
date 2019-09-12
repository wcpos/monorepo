import React from 'react';

import { storiesOf } from '@storybook/react';
import { action } from '@storybook/addon-actions';

import Dimmer from './';

storiesOf('Dimmer', module)
	/**
	 * Dimmer
	 */
	.add('basic usage', () => <Dimmer onPress={action('Dimmer pressed')} />);
