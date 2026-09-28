import type * as React from 'react';

import { Label } from './index';

const examples: ({ id: string } & React.ComponentProps<typeof Label>)[] = [
	{ id: 'default', children: 'Product name' },
];
export const stories = examples.map(({ id, ...props }) => ({
	id,
	render: () => <Label {...props} testID={`gallery-label-${id}`} />,
}));
