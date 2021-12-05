import * as React from 'react';
import { View } from 'react-native';
import { action } from '@storybook/addon-actions';
import { StoryWrapper } from '@storybook/addons';
import { Dropdown, DropdownProps } from './dropdown';
import Icon from '../icon';
import Portal from '../portal';
import Text from '../text';

/**
 * Dropdowns require (same as popover)
 * - SafeAreaProvider
 * - Portals
 * - AppProviderSizeProvider
 */
const AppProvider: StoryWrapper = (Story, context) => {
	return (
		<Portal.Provider>
			<Story {...context} />
			<Portal.Manager />
		</Portal.Provider>
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
		<Dropdown {...props}>
			<Text>Click me</Text>
		</Dropdown>
	</View>
);
BasicUsage.args = {
	items: ['Item 1', 'Item 2', 'Item 3', 'Item 4'],
	onSelect: action('Select'),
};

export const IconActivator = (props: DropdownProps) => (
	<View style={{ padding: '100px' }}>
		<Dropdown {...props}>
			<Icon name="ellipsisVertical" />
		</Dropdown>
	</View>
);
IconActivator.args = {
	items: [
		{ label: 'Item 1', action: action('Item 1') },
		{ label: 'Item 2', action: action('Item 2') },
		{ label: 'Item 3', action: action('Item 3') },
		{ label: 'Item 4', action: action('Item 4') },
	],
	onSelect: action('Select'),
};
