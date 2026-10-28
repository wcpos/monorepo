import type * as React from 'react';

import { IconButton } from './index';

type Props = React.ComponentProps<typeof IconButton>;

// Every variant at the default size, then every size at the default variant: the two axes
// are independent in the cva, so the cross product would only repeat cells.
const VARIANTS = [
	'default',
	'outline',
	'primary',
	'muted',
	'destructive',
	'secondary',
	'success',
] as const satisfies readonly NonNullable<Props['variant']>[];
const SIZES = ['xs', 'sm'] as const satisfies readonly NonNullable<Props['size']>[];

const ADD = 'Add product';

const examples: ({ id: string } & Props)[] = [
	...VARIANTS.map((variant): { id: string } & Props => ({
		id: variant,
		name: variant === 'destructive' ? 'delete' : 'plus',
		// An icon-only control's name says what it does.
		accessibilityLabel: variant === 'destructive' ? 'Delete product' : ADD,
		variant,
	})),
	...SIZES.map((size): { id: string } & Props => ({
		id: `size-${size}`,
		name: 'plus',
		accessibilityLabel: ADD,
		size,
	})),
	{ id: 'on', name: 'plus', accessibilityLabel: ADD, on: true },
	{ id: 'loading', name: 'plus', accessibilityLabel: ADD, loading: true },
	{ id: 'disabled', name: 'plus', accessibilityLabel: ADD, disabled: true },
];
export const stories = examples.map(({ id, ...props }) => ({
	id,
	render: () => <IconButton {...props} testID={`gallery-icon-button-${id}`} />,
}));
