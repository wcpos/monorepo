import React from 'react';
import { action } from '@storybook/addon-actions';
import { text, select, boolean } from '@storybook/addon-knobs';
import { storiesOf } from '@storybook/react';

import List from './';

storiesOf('List', module)
	/**
	 *
	 */
	.add('basic usage', () => <List items={['Apples', 'Pears', 'Oranges']} />)

	/**
	 *
	 */
	.add('with icon', () => (
		<List
			items={[
				{ name: 'Apples', icon: 'completed' },
				{ name: 'Pears', icon: 'completed' },
				{ name: 'Oranges', icon: 'completed' },
			]}
			keyExtractor={() => 'name'}
		/>
	))

	/**
	 *
	 */
	.add('selectable', () => (
		<List
			items={[
				{ name: 'Apples', icon: 'completed' },
				{ name: 'Pears', icon: 'completed' },
				{ name: 'Oranges', icon: 'completed' },
			]}
			keyExtractor={() => 'name'}
		/>
	));
