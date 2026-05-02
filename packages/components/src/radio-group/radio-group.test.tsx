import * as React from 'react';

import { fireEvent, render, screen } from '@testing-library/react';

import { RadioGroup, RadioGroupOption } from './index';

jest.mock('@rn-primitives/label', () => ({
	Text: ({ children, nativeID, onPress, ...props }: any) =>
		React.createElement('span', { ...props, id: nativeID, onClick: onPress }, children),
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
	it('does not emit onValueChange when pressing the already-selected option label', () => {
		const onValueChange = jest.fn();

		render(
			<RadioGroup value="comfortable" onValueChange={onValueChange}>
				<RadioGroupOption value="comfortable" label="Comfortable" />
			</RadioGroup>
		);

		fireEvent.click(screen.getByText('Comfortable'));

		expect(onValueChange).not.toHaveBeenCalled();
	});

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

		expect(onValueChange).toHaveBeenCalledTimes(1);
		expect(onValueChange).toHaveBeenCalledWith('comfortable');
		expect(screen.getByText('More relaxed spacing')).toBeInTheDocument();
	});

	it('does not throw when the label is pressed without an onValueChange handler', () => {
		render(
			<RadioGroup value="default">
				<RadioGroupOption value="comfortable" label="Comfortable" />
			</RadioGroup>
		);

		expect(() => fireEvent.click(screen.getByText('Comfortable'))).not.toThrow();
	});

	it('does not throw when the disabled label is pressed without an onValueChange handler', () => {
		render(
			<RadioGroup value="default">
				<RadioGroupOption value="comfortable" label="Comfortable" disabled />
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
		const label = screen.getByText('Comfortable');
		const description = screen.getByText('More relaxed spacing');

		expect(radio).toHaveAttribute('aria-labelledby');
		expect(label).toHaveAttribute('id', radio.getAttribute('aria-labelledby'));
		expect(radio).toHaveAttribute('aria-describedby');
		expect(description).toHaveAttribute('id', radio.getAttribute('aria-describedby'));
	});
});
