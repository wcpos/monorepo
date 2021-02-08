import * as React from 'react';
import { View } from 'react-native';
import Button from '../button';
import Text from '../text';

// import { select } from '@storybook/addon-knobs';

import Portal from '.';

export default {
	title: 'Components/Portal2',
};

/**
 *
 */
export const basicUsage = () => (
	<Portal.Provider>
		<View style={{ alignContent: 'center' }}>
			<Button
				onPress={() => {
					// key = Portal.add(contents);
					// console.log(key);
				}}
				title="Open Portal"
			/>
		</View>
		<Portal>
			<Text>hi</Text>
		</Portal>
	</Portal.Provider>
);
