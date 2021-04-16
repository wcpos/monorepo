import * as React from 'react';
import { View } from 'react-native';
import Button from '../button';
import Text from '../text';

// import { select } from '@storybook/addon-knobs';

import Portal from '.';

export default {
	title: 'Components/Portal',
};

const AppProvider = ({ children }) => {
	return (
		<Portal.Provider>
			{children}
			<Portal.Manager />
		</Portal.Provider>
	);
};

/**
 *
 */
export const basicUsage = () => {
	return (
		<AppProvider>
			<Text>In document flow</Text>
			<Portal keyPrefix="Test">
				<Text>Out of document flow</Text>
			</Portal>
			<Text>In document flow</Text>
		</AppProvider>
	);
};
