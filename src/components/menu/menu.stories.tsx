import React from 'react';

import { storiesOf } from '@storybook/react';
import { action } from '@storybook/addon-actions';

import Menu from './';

storiesOf('Menu', module)
	/**
	 *
	 */
	.add('basic usage', () => (
		<Menu items={[{ label: 'Item 1' }, { label: 'Item 2' }, { label: 'Item 3' }]} />
	));
