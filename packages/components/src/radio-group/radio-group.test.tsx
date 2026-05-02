import * as React from 'react';

import { fireEvent, render, screen } from '@testing-library/react';

import { RadioGroup, RadioGroupOption } from './index';

jest.mock('@rn-primitives/label', () => ({
	Text: ({ children, onPress }: any) => React.createElement('span', { onClick: onPress }, children),
}));

jest.mock('@rn-primitives/slot', () => ({
	Slot: ({ children, ...props }: any) => {
		if (React.isValidElement(children)) {
			return React.cloneElement(children, props);
		}
		return React.createElement('div', props, children);
	},
}));

jest.mock('@rn-primitives/radio-group', () => ({
	Root: ({ children, className, value }: any) =>
		React.createElement('div', { className, 'data-value': value }, children),
	Item: ({ children, className, disabled, onPress, value, ...props }: any) =>
		React.createElement(
			'button',
			{ className, disabled, value, onClick: onPress, ...props },
			children
		),
	Indicator: (props: any) => React.createElement('span', props),
}));

describe('RadioGroupOption', () => {
	it('selects the option when the label is pressed', () => {
		const onValueChange = jest.fn();

		render(
			<RadioGroup value="default" onValueChange={onValueChange}>
				<RadioGroupOption
					value="comfortable"
					label="Comfortable"
					description="More relaxed spacing"
					testID="comfortable-radio"
				/>
			</RadioGroup>
		);

		fireEvent.click(screen.getByText('Comfortable'));

		expect(onValueChange).toHaveBeenCalledWith('comfortable');
		expect(screen.getByText('More relaxed spacing')).toBeInTheDocument();
	});

	it('does not throw when the label is pressed without an onValueChange handler', () => {
		render(
			<RadioGroup defaultValue="default">
				<RadioGroupOption value="comfortable" label="Comfortable" />
			</RadioGroup>
		);

		expect(() => fireEvent.click(screen.getByText('Comfortable'))).not.toThrow();
	});

	it('links the option description to the radio item', () => {
		render(
			<RadioGroup value="default">
				<RadioGroupOption
					value="comfortable"
					label="Comfortable"
					description="More relaxed spacing"
				/>
			</RadioGroup>
		);

		const radio = screen.getByRole('button');
		const description = screen.getByText('More relaxed spacing');

		expect(radio).toHaveAttribute('aria-describedby');
		expect(description).toHaveAttribute('id', radio.getAttribute('aria-describedby'));
	});
});
