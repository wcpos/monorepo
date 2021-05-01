import * as React from 'react';
import { action } from '@storybook/addon-actions';
import Button from '../button';
import Backdrop from '.';

type BackdropProps = import('./backdrop').BackdropProps;

export default {
	title: 'Components/Backdrop',
	component: Backdrop,
};

export const basicUsage: React.FC<BackdropProps> = (props) => (
	<Backdrop {...props} onPress={action('Backdrop pressed')} />
);

export const backdropWithChildren: React.FC<BackdropProps> = (props) => (
	<Backdrop {...props}>
		<Button title="Press Me" onPress={action('Button pressed')} />
	</Backdrop>
);
