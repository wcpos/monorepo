import React from 'react';

import { storiesOf } from '@storybook/react';
import { action } from '@storybook/addon-actions';

import Dropdown from './';

storiesOf('Dropdown', module)
	/**
	 *
	 */
	.add('basic usage', () => <Dropdown />);
