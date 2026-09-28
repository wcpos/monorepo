import type * as React from 'react';

import { Button } from './index';

const examples: ({ id: string } & React.ComponentProps<typeof Button>)[] = [
	{ id: 'solid', children: 'Add product' },
	{ id: 'outline', variant: 'outline', children: 'Add product' },
	{ id: 'ghost', variant: 'ghost', children: 'Add product' },
	{ id: 'ghost-quiet', variant: 'ghost-quiet', children: 'Add product' },
	{ id: 'destructive', variant: 'destructive', children: 'Add product' },
	{ id: 'outline-destructive', variant: 'outline-destructive', children: 'Add product' },
	{ id: 'link', variant: 'link', children: 'Add product' },
	{ id: 'icon', leftIcon: 'plus', children: 'Add product' },
	{ id: 'loading', loading: true, children: 'Add product' },
	{ id: 'disabled', disabled: true, children: 'Add product' },
	{ id: 'sm', size: 'sm', children: 'Add product' },
	{ id: 'lg', size: 'lg', children: 'Add product' },
	{ id: 'xl', size: 'xl', children: 'Checkout £12.40' },
];
export const stories = examples.map(({ id, ...props }) => ({
	id,
	render: () => <Button {...props} testID={`gallery-button-${id}`} />,
}));
