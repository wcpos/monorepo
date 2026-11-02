import { RadioGroup, RadioGroupOption } from './index';

const examples = [
	{ id: 'options', disabled: false },
	{ id: 'disabled', disabled: true },
];
export const stories = examples.map(({ id, disabled }) => ({
	id,
	render: () => (
		<RadioGroup value="collection" disabled={disabled}>
			<RadioGroupOption
				value="delivery"
				label="Delivery"
				description="Send to the customer"
				testID={`gallery-radio-${id}-delivery`}
			/>
			<RadioGroupOption
				value="collection"
				label="Collection"
				testID={`gallery-radio-${id}-collection`}
			/>
			<RadioGroupOption
				value="counter"
				label="At the counter"
				testID={`gallery-radio-${id}-counter`}
			/>
		</RadioGroup>
	),
}));
