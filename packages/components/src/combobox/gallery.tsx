import { Combobox, ComboboxTrigger, ComboboxValue } from './index';

export const stories = [
	{
		id: 'default',
		render: () => (
			<Combobox value={{ value: 'canvas', label: 'Canvas tote' }}>
				<ComboboxTrigger testID="gallery-combobox">
					<ComboboxValue placeholder="Choose product" />
				</ComboboxTrigger>
			</Combobox>
		),
	},
];
