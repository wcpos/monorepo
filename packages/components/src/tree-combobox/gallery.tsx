import * as React from 'react';
import { View } from 'react-native';

import { useRootContext } from '@rn-primitives/popover';

import { DeviceScope } from '../lib/device';
import * as C from './index';
import { TreeCombobox, TreeComboboxTrigger, TreeComboboxValue } from './index';

// The closed face over a real category tree; the value story carries a selection.
const options = [
	{ value: 'clothing', label: 'Clothing', children: [{ value: 'hats', label: 'Hats' }] },
	{ value: 'coffee', label: 'Coffee' },
];
const examples = [
	{ id: 'value', value: options[0], label: 'Clothing' },
	{ id: 'placeholder', value: undefined, label: 'Choose category' },
];
const closed = examples.map(({ id, value, label }) => ({
	id,
	render: () => (
		<TreeCombobox options={options} value={value} onValueChange={() => {}}>
			<TreeComboboxTrigger testID={`gallery-tree-combobox-${id}`}>
				<TreeComboboxValue hasValue={!!value}>{label}</TreeComboboxValue>
			</TreeComboboxTrigger>
		</TreeCombobox>
	),
}));
function Open() {
	const open = React.useRef(useRootContext().onOpenChange);
	// Mount the external primitive in its open gallery state.
	React.useEffect(() => open.current(true), []);
	return null;
}
export const stories = closed.concat(
	['open', 'sheet'].map((id) => ({
		id,
		isolated: id === 'open',
		render: () => (
			<DeviceScope phone={id === 'sheet'}>
				<View
					className={`border-border bg-background relative h-96 ${id === 'sheet' ? 'w-80' : 'w-full'} overflow-hidden rounded-lg border [&>*]:flex-1`}
				>
					<C.TreeCombobox options={options} defaultExpanded="all">
						<Open />
						<C.TreeComboboxTrigger testID="categories">
							<C.TreeComboboxValue hasValue={false}>Choose category</C.TreeComboboxValue>
						</C.TreeComboboxTrigger>
						<C.TreeComboboxContent inline />
					</C.TreeCombobox>
				</View>
			</DeviceScope>
		),
	}))
);
