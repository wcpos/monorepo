import * as React from 'react';
import Text from '../../components/text';

import useKey, { useEscKey } from '.';

export default {
	title: 'Hooks/useKey',
};

/**
 *
 */
export const all = () => {
	useKey((pressedKey) => {
		console.log('Detected Key press', pressedKey);
	});
	return <Text>hi</Text>;
};

/**
 *
 */
export const esc = () => {
	useEscKey((pressedKey) => {
		console.log('Detected Key press', pressedKey);
	});
	return <Text>hi</Text>;
};
