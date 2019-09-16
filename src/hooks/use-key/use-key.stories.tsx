import React, { useState } from 'react';
import Text from '../../components/text';

import { storiesOf } from '@storybook/react';

import useKey, { useEscKey } from './';

const MyComponent = () => {
	useKey(pressedKey => {
		console.log('Detected Key press', pressedKey);
	});
	return <Text>hi</Text>;
};

const MyComponent1 = () => {
	useEscKey(pressedKey => {
		console.log('Detected Key press', pressedKey);
	});
	return <Text>hi</Text>;
};

storiesOf('useKeys', module)
	/**
	 *
	 */
	.add('basic usage', () => {
		return <MyComponent />;
	})

	/**
	 *
	 */
	.add('esc key', () => {
		return <MyComponent1 />;
	});
