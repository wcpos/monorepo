import { View } from 'react-native';

import { TreeCombobox, TreeComboboxTrigger } from './index';
import { Icon } from '../icon';
import { Text } from '../text';

// The trigger owns no chrome of its own (its callers draw the value box), so the
// stories draw the same box the combobox value renders, over a real category tree.
const options = [
	{ value: 'clothing', label: 'Clothing', children: [{ value: 'hats', label: 'Hats' }] },
	{ value: 'coffee', label: 'Coffee' },
];
const examples = [
	{ id: 'value', value: options[0], label: 'Clothing' },
	{ id: 'placeholder', value: undefined, label: 'Choose category' },
];
export const stories = examples.map(({ id, value, label }) => ({
	id,
	render: () => (
		<TreeCombobox options={options} value={value} onValueChange={() => {}}>
			<TreeComboboxTrigger testID={`gallery-tree-combobox-${id}`}>
				<View className="border-border bg-card h-ctl w-full flex-row items-center rounded-lg border px-3">
					<Text
						className={
							value ? 'text-foreground flex-1 text-base' : 'text-muted-foreground flex-1 text-base'
						}
					>
						{label}
					</Text>
					<Icon name="chevronDown" className="text-muted-foreground" />
				</View>
			</TreeComboboxTrigger>
		</TreeCombobox>
	),
}));
