import * as React from 'react';
import { View } from 'react-native';
import { action } from '@storybook/addon-actions';
import Button from '../button';
import Text from '../text';
import Icon from '../icon';
import Portal from '../portal';
import { Dialog, DialogProps } from './dialog';
import { useDialog } from './use-dialog';

/**
 * Modal require
 * - Portals
 */
const AppProvider = (Story, context) => {
	return (
		<Portal.Provider>
			<Story {...context} />
			<Portal.Manager />
		</Portal.Provider>
	);
};

export default {
	title: 'Components/Dialog',
	component: Dialog,
	decorators: [AppProvider],
	// subcomponents: { 'Dialog.Section': Dialog.Section },
};

const LOREM_IPSUM =
	'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.';

export const BasicUsage = (props: DialogProps) => {
	const dialogRef = React.useRef<typeof Dialog>(null);

	const onOpen = () => {
		dialogRef.current?.open();
	};

	const onClose = () => {
		dialogRef.current?.close();
	};

	return (
		<View style={{ height: '300px' }}>
			<Button title="Do something risky" onPress={onOpen} />

			<Dialog ref={dialogRef} {...props} />
		</View>
	);
};
BasicUsage.args = {
	children: 'This is very important!',
	onClose: action('onClose'),
};

export const UseDialog = (props: DialogProps) => {
	const { ref, open } = useDialog();

	return (
		<View style={{ height: '300px' }}>
			<Button title="Do something risky" onPress={open} />

			<Dialog ref={ref} {...props} />
		</View>
	);
};
UseDialog.args = {
	children: 'This is very important!',
	onClose: action('onClose'),
};
