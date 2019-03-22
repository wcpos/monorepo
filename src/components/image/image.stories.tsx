import React from 'react';

import { text, select } from '@storybook/addon-knobs';
import { storiesOf } from '@storybook/react';

import Image from './';

storiesOf('Image', module)
	/**
	 *
	 */
	.add('basic usage', () => (
		<Image
			src={text('src', 'https://picsum.photos/200/300/?random')}
			style={{ width: 300, height: 200 }}
			border={select('border', ['none', 'rounded', 'circular'], 'none')}
		/>
	));
