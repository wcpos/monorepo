import type * as React from 'react';
import { View } from 'react-native';

import { Icon } from '../icon';
import { Button, ButtonText } from './index';

type Props = React.ComponentProps<typeof Button>;

// The eight kept variants and four sizes (CODING_STANDARDS § Design, Buttons; ruled
// 2026-10-16): one story per variant × size, so a change to any cell of the table shows.
const VARIANTS = [
	'default',
	'outline',
	'on-warning',
	'ghost',
	'link',
	'outline-destructive',
	'ghost-destructive',
	'destructive',
] as const satisfies readonly NonNullable<Props['variant']>[];
const SIZES = ['sm', 'default', 'lg', 'stack'] as const satisfies readonly NonNullable<
	Props['size']
>[];

const examples: ({ id: string } & Props)[] = [
	...VARIANTS.flatMap((variant) =>
		SIZES.map((size) => ({
			id: `${variant}-${size}`,
			variant,
			size,
			children:
				size === 'stack' ? (
					<>
						<Icon name="plus" />
						<ButtonText>Pay in</ButtonText>
					</>
				) : size === 'lg' ? (
					'Checkout £12.40'
				) : (
					'Add product'
				),
		}))
	),
	{ id: 'icon', leftIcon: 'plus', children: 'Add product' },
	{ id: 'loading', loading: true, children: 'Add product' },
	{ id: 'disabled', disabled: true, children: 'Add product' },
	{ id: 'outline-disabled', variant: 'outline', disabled: true, children: 'Add product' },
];
export const stories = examples.map(({ id, ...props }) => ({
	id,
	render: () =>
		// `on-warning` lives on the solid warning ground (the Free strip on dark themes); the cell's
		// page colour would show an outline the variant never stands on (CodeRabbit, #3204).
		props.variant === 'on-warning' ? (
			<View className="bg-warning rounded-lg p-2">
				<Button {...props} testID={`gallery-button-${id}`} />
			</View>
		) : (
			<Button {...props} testID={`gallery-button-${id}`} />
		),
}));
