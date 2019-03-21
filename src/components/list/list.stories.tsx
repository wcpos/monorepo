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
				{ label: 'Apples', icon: 'completed' },
				{ label: 'Pears', icon: 'completed' },
				{ label: 'Oranges', icon: 'completed' },
			]}
		/>
	))

	/**
	 *
	 */
	.add('selectable', () => (
		<List
			items={[
				{
					name: 'Apples',
					icon: 'completed',
					info: 'Culpa aliquip reprehenderit ex incididunt do in proident exercitation.',
					action: 'Remove',
				},
				{
					name: 'Pears',
					icon: 'completed',
					info: 'Dolore cillum commodo non sunt laborum ullamco deserunt cupidatat.',
					action: 'Remove',
				},
				{
					name: 'Oranges',
					icon: 'completed',
					info: 'Incididunt cillum elit et amet sunt ea consectetur ex ea occaecat ad est.',
					action: 'Remove',
				},
			]}
			keyExtractor={() => 'name'}
		/>
	));
