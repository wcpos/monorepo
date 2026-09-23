import { View } from 'react-native';

import { TreeCombobox, TreeComboboxTrigger } from './index';
import { Icon } from '../icon';
import { Text } from '../text';

const examples = [
	{ id: 'value', label: 'Clothing' },
	{ id: 'placeholder', label: 'Choose category' },
];
export const stories = examples.map(({ id, label }) => ({
	id,
	render: () => (
		<TreeCombobox options={[]}>
			<TreeComboboxTrigger testID={`gallery-tree-combobox-${id}`}>
				<View className="border-border bg-card h-ctl w-full flex-row items-center rounded-lg border px-3">
					<Text
						className={
							id === 'placeholder'
								? 'text-muted-foreground flex-1 text-base'
								: 'text-foreground flex-1 text-base'
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
