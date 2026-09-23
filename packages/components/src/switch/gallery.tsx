import type * as React from 'react';

import { Switch, SwitchWithLabel } from './index';

const examples: ({ id: string } & Omit<React.ComponentProps<typeof Switch>, 'onCheckedChange'>)[] =
	[
		{ id: 'off', checked: false },
		{ id: 'on', checked: true },
		{ id: 'sm', checked: true, size: 'sm' },
		{ id: 'disabled', checked: true, disabled: true },
	];
export const stories = examples.map(({ id, ...props }) => ({
	id,
	render: () => <Switch onCheckedChange={() => {}} {...props} testID={`gallery-switch-${id}`} />,
}));
stories.push({
	id: 'label',
	render: () => (
		<SwitchWithLabel
			onCheckedChange={() => {}}
			nativeID="gallery-switch-label"
			label="Track stock"
			checked
		/>
	),
});
