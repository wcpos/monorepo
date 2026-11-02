import type * as React from 'react';

import { Button } from './index';

type Props = React.ComponentProps<typeof Button>;

// The seven kept variants and three sizes (CODING_STANDARDS § Design, Buttons; ruled
// 2026-10-16): one story per variant × size, so a change to any cell of the table shows.
const VARIANTS = [
	'default',
	'outline',
	'ghost',
	'link',
	'outline-destructive',
	'ghost-destructive',
	'destructive',
] as const satisfies readonly NonNullable<Props['variant']>[];
const SIZES = ['sm', 'default', 'lg'] as const satisfies readonly NonNullable<Props['size']>[];

const examples: ({ id: string } & Props)[] = [
	...VARIANTS.flatMap((variant) =>
		SIZES.map((size) => ({
			id: `${variant}-${size}`,
			variant,
			size,
			children: size === 'lg' ? 'Checkout £12.40' : 'Add product',
		}))
	),
	{ id: 'icon', leftIcon: 'plus', children: 'Add product' },
	{ id: 'loading', loading: true, children: 'Add product' },
	{ id: 'disabled', disabled: true, children: 'Add product' },
	{ id: 'outline-disabled', variant: 'outline', disabled: true, children: 'Add product' },
];
export const stories = examples.map(({ id, ...props }) => ({
	id,
	render: () => <Button {...props} testID={`gallery-button-${id}`} />,
}));
