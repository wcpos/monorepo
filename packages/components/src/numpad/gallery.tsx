import type * as React from 'react';

import { Numpad } from './index';

const examples: ({ id: string } & React.ComponentProps<typeof Numpad>)[] = [
	{ id: 'default', initialValue: 12.5, formatDisplay: (value) => value.toFixed(2) },
	{ id: 'discounts', initialValue: 12.5, discounts: [5, 10, 15, 20] },
	{ id: 'negative', initialValue: -12.5 },
];
export const stories = examples.map(({ id, ...props }) => ({
	id,
	render: () => <Numpad {...props} />,
}));
