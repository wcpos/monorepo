import * as React from 'react';
import { action } from '@storybook/addon-actions';
import { Numpad, NumpadProps } from './numpad';

export default {
	title: 'Components/Numpad',
	component: Numpad,
};

export const basicUsage = (props: NumpadProps) => {
	return <Numpad {...props} />;
};
