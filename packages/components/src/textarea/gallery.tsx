import type * as React from 'react';

import { Textarea } from './index';

const examples: ({ id: string } & React.ComponentProps<typeof Textarea>)[] = [
	{ id: 'default', value: 'Gift wrap\nInclude a receipt' },
	{ id: 'disabled', value: 'Gift wrap', editable: false },
];
export const stories = examples.map(({ id, ...props }) => ({
	id,
	render: () => <Textarea {...props} testID={`gallery-textarea-${id}`} />,
}));
