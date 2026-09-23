import type * as React from 'react';

import { Icon } from '../icon';
import { Input } from './index';

const examples: ({ id: string } & React.ComponentProps<typeof Input>)[] = [
	{ id: 'default', value: 'Canvas tote' },
	{ id: 'placeholder', placeholder: 'Product name' },
	{ id: 'clearable', defaultValue: 'Canvas tote', clearable: true },
	{ id: 'disabled', value: 'Canvas tote', disabled: true },
];
export const stories = examples.map(({ id, ...props }) => ({
	id,
	render: () => <Input {...props} testID={`gallery-input-${id}`} />,
}));
stories.push({
	id: 'left',
	render: () => (
		<Input.Root>
			<Input.Left>
				<Icon name="magnifyingGlass" />
			</Input.Left>
			<Input.InputField value="Canvas tote" testID="gallery-input-left" />
		</Input.Root>
	),
});
