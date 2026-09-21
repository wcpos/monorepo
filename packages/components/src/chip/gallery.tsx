import type * as React from 'react';

import { Chip } from './index';

const examples: ({ id: string } & React.ComponentProps<typeof Chip>)[] = [
	{ id: 'plain', label: 'Morning menu' },
	{ id: 'on', label: 'Morning menu', on: true },
	{ id: 'count', label: 'Morning menu', count: 2 },
	{ id: 'clear', label: 'Morning menu', onClear: () => {} },
	{ id: 'dimmed', label: 'Morning menu', dimmed: true },
	{ id: 'add', label: 'Add quick filter', add: true, icon: 'plus' },
];
export const stories = examples.map(({ id, ...props }) => ({
	id,
	render: () => <Chip {...props} testID={`gallery-chip-${id}`} />,
}));
