import { Combobox, ComboboxTrigger, ComboboxValue } from './index';

const examples = [
	{ id: 'value', value: { value: 'canvas', label: 'Canvas tote' } },
	{ id: 'placeholder' },
	{ id: 'disabled', disabled: true },
];
export const stories = examples.map(({ id, value, disabled }) => ({
	id,
	render: () => (
		<Combobox value={value}>
			<ComboboxTrigger disabled={disabled} testID={`gallery-combobox-${id}`}>
				<ComboboxValue placeholder="Choose product" />
			</ComboboxTrigger>
		</Combobox>
	),
}));
