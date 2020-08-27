import React from 'react';

import { select } from '@storybook/addon-knobs';

import Logo from '.';

export default {
	title: 'Components/Logo',
};

export const basicUsage = () => <Logo animate={false} />;
