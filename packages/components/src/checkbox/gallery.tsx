import type * as React from 'react';

import { Checkbox } from './index';

const examples: ({ id: string } & Omit<
	React.ComponentProps<typeof Checkbox>,
	'onCheckedChange'
>)[] = [
	{ id: 'off', checked: false },
	{ id: 'on', checked: true },
	{ id: 'indeterminate', checked: false, indeterminate: true },
	{ id: 'disabled', checked: true, disabled: true },
];
export const stories = examples.map(({ id, ...props }) => ({
	id,
	render: () => (
		<Checkbox onCheckedChange={() => {}} {...props} testID={`gallery-checkbox-${id}`} />
	),
}));
