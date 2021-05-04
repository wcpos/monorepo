import * as React from 'react';
import { View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StoryWrapper } from '@storybook/addons';
import { AppProviderSizeProvider } from '@wcpos/common/src/hooks/use-position-in-app';
import { Combobox, ComboboxProps } from './combobox';
import Portal from '../portal';

/**
 * Combobox require (uses Popover)
 * - SafeAreaProvider
 * - Portals
 * - AppProviderSizeProvider
 */
const AppProvider: StoryWrapper = (Story, context) => {
	return (
		<SafeAreaProvider>
			<AppProviderSizeProvider>
				<Portal.Provider>
					<Story {...context} />
					<Portal.Manager />
				</Portal.Provider>
			</AppProviderSizeProvider>
		</SafeAreaProvider>
	);
};

export default {
	title: 'Components/Combobox',
	component: Combobox,
	decorators: [AppProvider],
};

export const BasicUsage = (props: ComboboxProps) => {
	return (
		<View style={{ height: '500px' }}>
			<Combobox {...props} />
		</View>
	);
};
BasicUsage.args = {
	// label: 'Select your favorite color',
	selected: null,
	// placeholder: 'Should be a color',
	// helpText: 'Colors are displayed in neutral color, in case you are color blind.',
	choices: [
		{ label: 'Blue', value: 'blue' },
		{ label: 'Red', value: 'red' },
		{ label: 'Green', value: 'green' },
		{ label: 'Yellow', value: 'yellow' },
	],
};
