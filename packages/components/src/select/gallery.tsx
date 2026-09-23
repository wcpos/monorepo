import * as React from 'react';
import { View } from 'react-native';

import { useRootContext } from '@rn-primitives/popover';

import * as C from './index';
import { Select, SelectTrigger, SelectValue } from './index';

const examples = [
	{ id: 'value', value: { value: 'canvas', label: 'Canvas tote' } },
	{ id: 'placeholder' },
	{ id: 'disabled', disabled: true },
];
const closed = examples.map(({ id, value, disabled }) => ({
	id,
	render: () => (
		<Select value={value}>
			<SelectTrigger disabled={disabled} testID={`gallery-select-${id}`}>
				<SelectValue placeholder="Choose product" />
			</SelectTrigger>
		</Select>
	),
}));
function Open() {
	const open = React.useRef(useRootContext().onOpenChange);
	// Mount the external primitive in its open gallery state.
	React.useEffect(() => open.current(true), []);
	return null;
}
const sizes = ['Small', 'Medium', 'Large', 'Extra large'].map((label) => ({ value: label, label }));
export const stories = closed.concat(
	[false, true].map((multiple) => ({
		id: multiple ? 'multi-open' : 'open',
		render: () => (
			<View className="border-border bg-background relative h-96 w-full overflow-hidden rounded-lg border">
				<C.Select
					{...(multiple ? { multiple: true, value: sizes.slice(0, 2) } : { value: sizes[1] })}
					open
				>
					{multiple && <Open />}
					<C.SelectTrigger testID="size">
						<C.SelectValue placeholder="Size" />
					</C.SelectTrigger>
					<C.SelectContent inline>
						{!multiple && (
							<C.SelectGroup>
								<C.SelectLabel>Size</C.SelectLabel>
							</C.SelectGroup>
						)}
						<C.SelectSeparator />
						{sizes.map((option) => (
							<C.SelectItem key={option.value} {...option} />
						))}
					</C.SelectContent>
				</C.Select>
			</View>
		),
	}))
);
