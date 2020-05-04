import React from 'react';

import { storiesOf } from '@storybook/react';
import { select } from '@storybook/addon-knobs';

import Logo from './';

storiesOf('Logo', module)
	/**
	 *
	 */
	.add('basic usage', () => <Logo animate={false} />);
