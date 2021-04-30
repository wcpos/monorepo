import * as React from 'react';
import { View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StoryWrapper } from '@storybook/addons';
import { action } from '@storybook/addon-actions';
import { Snackbar, SnackbarProps } from './snackbar';
import { SnackbarProvider } from './snackbar-provider';
import { useSnackbar } from './use-snackbar';
import Button from '../button';

/**
 * Snackbar require
 * - SafeAreaProvider
 * - SnackbarProvider
 * - AppProviderSizeProvider
 */
const AppProvider: StoryWrapper = (Story, context) => {
	return (
		<SafeAreaProvider>
			<SnackbarProvider>
				<Story {...context} />
			</SnackbarProvider>
		</SafeAreaProvider>
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
	const showSnackbar = useSnackbar(props);

	return (
		<View style={{ height: '300px', alignItems: 'flex-start' }}>
			<Button
				onPress={() => {
					showSnackbar();
				}}
			>
				Show Snackbar
			</Button>
		</View>
	);
};
BasicUsage.args = {
	message: 'This is a Snackbar!',
};

/**
 *
 */
export const WithAction = () => {
	const showSnackbar = useSnackbar({
		message: 'Blog post saved.',
		duration: 'longer',
		action: { label: 'Undo', action: action('Undo Clicked') },
	});

	return (
		<View style={{ height: '300px', alignItems: 'flex-start' }}>
			<Button onPress={showSnackbar}>Show Snackbar</Button>
		</View>
	);
};
