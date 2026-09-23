import type * as React from 'react';

import { IconButton } from './index';

const examples: ({ id: string } & React.ComponentProps<typeof IconButton>)[] = [
	{ id: 'default', name: 'plus' },
	{ id: 'on', name: 'plus', on: true },
	{
		id: 'destructive',
		name: 'trash',
		variant: 'destructive',
		accessibilityLabel: 'Delete product',
	},
	{ id: 'sm', name: 'plus', size: 'sm' },
	{ id: 'loading', name: 'plus', loading: true },
	{ id: 'disabled', name: 'plus', disabled: true },
];
export const stories = examples.map(({ id, ...props }) => ({
	id,
	render: () => (
		<IconButton accessibilityLabel="Add product" {...props} testID={`gallery-icon-button-${id}`} />
	),
}));
