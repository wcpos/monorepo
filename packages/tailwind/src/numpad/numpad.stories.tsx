import * as React from 'react';

import { Numpad, NumpadProps } from './numpad';

import type { Meta } from '@storybook/react';

const meta: Meta<typeof Numpad> = {
	title: 'Components/Numpad',
	component: Numpad,
};

export const basicUsage = (props: NumpadProps) => {
	return <Numpad {...props} />;
};

export const calculator = (props: NumpadProps) => {
	return <Numpad {...props} />;
};
calculator.args = {
	calculator: true,
};

export const withDiscounts = (props: NumpadProps) => {
	return <Numpad {...props} />;
};
withDiscounts.args = {
	discounts: [5, 10, 15, 20],
};

export default meta;
