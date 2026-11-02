import type * as React from 'react';

import { Slider } from './index';

const examples: ({ id: string } & React.ComponentProps<typeof Slider>)[] = [
	{ id: 'default', value: 40 },
	{ id: 'disabled', value: 40, disabled: true },
];
export const stories = examples.map(({ id, ...props }) => ({
	id,
	render: () => <Slider {...props} />,
}));
