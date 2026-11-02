import * as React from 'react';
import { View } from 'react-native';

import { useRootContext } from '@rn-primitives/popover';

import { DeviceScope } from '../lib/device';
import * as C from './index';
import { Combobox, ComboboxTrigger, ComboboxValue } from './index';

const examples = [
	{ id: 'value', value: { value: 'canvas', label: 'Canvas tote' } },
	{ id: 'placeholder' },
	{ id: 'disabled', disabled: true },
];
const closed = examples.map(({ id, value, disabled }) => ({
	id,
	render: () => (
		<Combobox value={value}>
			<ComboboxTrigger disabled={disabled} testID={`gallery-combobox-${id}`}>
				<ComboboxValue placeholder="Choose product" />
			</ComboboxTrigger>
		</Combobox>
	),
}));
function Open() {
	const open = React.useRef(useRootContext().onOpenChange);
	// Mount the external primitive in its open gallery state.
	React.useEffect(() => open.current(true), []);
	return null;
}
const options = ['Canvas tote', 'Coffee', 'Notebook', 'Pencil', 'Water bottle'].map((label) => ({
	value: label,
	label,
}));
export const stories = closed.concat(
	['open', 'sheet'].map((id) => ({
		id,
		isolated: id === 'open',
		render: () => (
			<DeviceScope phone={id === 'sheet'}>
				<View
					className={`border-border bg-background relative h-96 ${id === 'sheet' ? 'w-80' : 'w-full'} overflow-hidden rounded-lg border [&>*]:flex-1`}
				>
					<C.Combobox value={options[0]}>
						<Open />
						<C.ComboboxTrigger testID="products">
							<C.ComboboxValue placeholder="Choose product" />
						</C.ComboboxTrigger>
						<C.ComboboxContent inline align="start" avoidCollisions={false}>
							<C.ComboboxInput />
							<C.ComboboxList
								data={options}
								estimatedItemSize={36}
								renderItem={({ item }) => (
									<C.ComboboxItem {...item} item={item.item}>
										<C.ComboboxItemText />
									</C.ComboboxItem>
								)}
							/>
						</C.ComboboxContent>
					</C.Combobox>
				</View>
			</DeviceScope>
		),
	}))
);
