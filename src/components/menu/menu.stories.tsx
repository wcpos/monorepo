import * as React from 'react';

import { action } from '@storybook/addon-actions';

import Menu from '.';

export default {
	title: 'Components/Menu',
};

export const basicUsage = () => (
	<Menu items={[{ label: 'Item 1' }, { label: 'Item 2' }, { label: 'Item 3' }]} />
);
