import * as React from 'react';
import { View } from 'react-native';
import { StoryWrapper } from '@storybook/addons';
import { action } from '@storybook/addon-actions';
import { Snackbar, SnackbarProps } from './snackbar';
import { useSnackbar } from './use-snackbar';
import Button from '../button';
import Portal from '../portal';

/**
 * Snackbar require
 * - Portals
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
	title: 'Components/Snackbar',
	component: Snackbar,
	decorators: [AppProvider],
};

/**
 *
 */
export const BasicUsage: React.FC<SnackbarProps> = (props) => {
	const { ref, open, close } = useSnackbar();

	return (
		<View style={{ height: '300px', width: '100%' }}>
			<Button onPress={open}>Open</Button>
			<Snackbar ref={ref} {...props} />
		</View>
	);
};
BasicUsage.args = {
	message: 'This is a Snackbar!',
	onDismiss: action('Dismissed'),
};

/**
 *
 */
export const WithAction: React.FC<SnackbarProps> = (props) => {
	const { ref, open, close } = useSnackbar();

	return (
		<View style={{ height: '300px', width: '100%' }}>
			<Button onPress={open}>Open</Button>
			<Snackbar ref={ref} {...props} />
		</View>
	);
};
WithAction.args = {
	message: 'This is a Snackbar!',
	onDismiss: action('Dismissed'),
	action: {
		label: 'Undo',
		action: action('Undo'),
	},
};
