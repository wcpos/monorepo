import React from 'react';
import { ActivityIndicator } from 'react-native';

// import { text } from '@storybook/addon-knobs';
import { storiesOf } from '@storybook/react';

import Image from './';

storiesOf('Image', module)
	/**
	 *
	 */
	.add('basic usage', () => (
		// @ts-ignore
		<Image
			source={{ uri: 'https://picsum.photos/200/300/?random' }}
			style={{ width: 300, height: 200 }}
			// @ts-ignore
			PlaceholderContent={<ActivityIndicator />}
		/>
	));
