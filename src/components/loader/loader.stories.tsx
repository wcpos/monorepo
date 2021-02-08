import * as React from 'react';

import { select } from '@storybook/addon-knobs';

import Loader from '.';

export default {
	title: 'Components/Loader',
};

export const basicUsage = () => <Loader size={select('size', ['small', 'large'], 'small')} />;
