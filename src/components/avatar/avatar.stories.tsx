import React from 'react';

import { text, select } from '@storybook/addon-knobs';
import { storiesOf } from '@storybook/react';

import Avatar from './';

storiesOf('Avatar', module)
	/**
	 *
	 */
	.add('basic usage', () => (
		<Avatar
			src={text('src', 'https://picsum.photos/200/200/?people')}
			size={select('size', ['', 'small', 'large'], '')}
		/>
	));
