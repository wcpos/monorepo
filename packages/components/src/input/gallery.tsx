import type * as React from 'react';

import { amountFigure } from '../amount-figure';
import { Icon } from '../icon';
import { cn } from '../lib/utils';
import { Text } from '../text';
import { Input } from './index';

const SYMBOL = 'text-2xl text-muted-foreground tabular-nums';

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
				<Icon name="search" />
			</Input.Left>
			<Input.InputField value="Canvas tote" testID="gallery-input-left" />
		</Input.Root>
	),
});
stories.push(
	{
		id: 'figure',
		render: () => (
			<Input.Root figure>
				<Input.Left>
					<Text className={SYMBOL}>$</Text>
				</Input.Left>
				<Input.InputField
					type="decimal"
					value="150.00"
					className={cn(amountFigure({ size: 'hero' }), 'placeholder:font-normal', 'pl-1.5')}
					testID="gallery-input-figure"
				/>
			</Input.Root>
		),
	},
	{
		id: 'figure-empty',
		render: () => (
			<Input.Root figure>
				<Input.Left>
					<Text className={SYMBOL}>$</Text>
				</Input.Left>
				<Input.InputField
					type="decimal"
					placeholder="0.00"
					className={cn(amountFigure({ size: 'hero' }), 'placeholder:font-normal', 'pl-1.5')}
					testID="gallery-input-figure-empty"
				/>
			</Input.Root>
		),
	}
);
