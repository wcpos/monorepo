import React from 'react';
import Portal from '../portal'

import { storiesOf } from '@storybook/react';
import { action } from '@storybook/addon-actions';

import Select from './';

storiesOf('Select', module)
	/**
	 *
	 */
	.add('basic usage', () => <Portal.Host>
		<Select placeholder="Select Option" options={[
			{label: 'Option 1'}, 
			{label: 'Option 2'}, 
			{label: 'Option 3'}, 
			{label: 'Option 4'}, 
			{label: 'Option 5'}]} />
			</Portal.Host>);
