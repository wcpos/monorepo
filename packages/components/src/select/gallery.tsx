import { Select, SelectTrigger, SelectValue } from './index';

const examples = [
	{ id: 'value', value: { value: 'canvas', label: 'Canvas tote' } },
	{ id: 'placeholder' },
	{ id: 'disabled', disabled: true },
];
export const stories = examples.map(({ id, value, disabled }) => ({
	id,
	render: () => (
		<Select value={value}>
			<SelectTrigger disabled={disabled} testID={`gallery-select-${id}`}>
				<SelectValue placeholder="Choose product" />
			</SelectTrigger>
		</Select>
	),
}));
