import * as React from 'react';
import { View } from 'react-native';
import { action } from '@storybook/addon-actions';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StoryWrapper } from '@storybook/addons';
import { AppProviderSizeProvider } from '@wcpos/common/src/hooks/use-position-in-app';
import { Dropdown, DropdownProps } from './dropdown';
import Portal from '../portal';

/**
 * Dropdowns require (same as popover)
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
	title: 'Components/Dropdown',
	component: Dropdown,
	// subcomponents: { 'Dropdown.Item': Dropdown.Item },
	decorators: [AppProvider],
};

export const BasicUsage = (props: DropdownProps) => (
	<View style={{ padding: '100px' }}>
		<Dropdown {...props} />
	</View>
);
BasicUsage.args = {
	activator: 'Click me',
	items: ['Item 1', 'Item 2', 'Item 3', 'Item 4'],
	onSelect: action('Select'),
};
