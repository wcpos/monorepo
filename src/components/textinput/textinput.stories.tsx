import React from 'react';

import { text } from '@storybook/addon-knobs';
import { storiesOf } from '@storybook/react';

import TextInput from './';

storiesOf('TextInput', module)
	/**
	 *
	 */
	.add('basic usage', () => <TextInput placeholder={text('placeholder', 'Placeholder text')} />);
