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
export const stories = examples.map(({ id, value, label }) => ({
	id,
	render: () => (
		<TreeCombobox options={options} value={value} onValueChange={() => {}}>
			<TreeComboboxTrigger testID={`gallery-tree-combobox-${id}`}>
				<TreeComboboxValue hasValue={!!value}>{label}</TreeComboboxValue>
			</TreeComboboxTrigger>
		</TreeCombobox>
	),
}));
