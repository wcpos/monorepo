import * as React from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { action } from '@storybook/addon-actions';
import { Snackbar, SnackbarProps } from './snackbar';
import { SnackbarProvider } from './snackbar-provider';
import { useSnackbar } from './use-snackbar';
import Button from '../button';

export default {
	title: 'Components/Snackbar',
	component: Snackbar,
};

/**
 * Popovers require
 * - SafeAreaProvider
 * - Portals
 * - AppProviderSizeProvider
 */
const AppProvider: React.FC = ({ children }) => {
	return <SnackbarProvider>{children}</SnackbarProvider>;
};

export const BasicUsage = (props: SnackbarProps) => {
	const showSnackbar = useSnackbar(props);

	return (
		<AppProvider>
			<Button onPress={showSnackbar}>Show Snackbar</Button>
		</AppProvider>
	);
};
BasicUsage.args = {
	message: 'This is a Snackbar!',
};

export const WithAction = () => {
	const showSnackbar = useSnackbar({
		message: 'Blog post saved.',
		duration: 'longer',
		action: { label: 'Undo', action: action('Undo Clicked') },
	});

	return (
		<AppProvider>
			<Button onPress={showSnackbar}>Show Snackbar</Button>
		</AppProvider>
	);
};
