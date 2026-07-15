/* eslint-disable import/first, @typescript-eslint/no-require-imports */
import * as React from 'react';

import { fireEvent, render, screen } from '@testing-library/react';

jest.mock('./common', () => ({
	FormItem: ({ children }: any) => React.createElement('div', null, children),
	FormLabel: ({ children, nativeID }: any) =>
		React.createElement('label', { id: nativeID }, children),
	FormDescription: ({ children }: any) => React.createElement('p', null, children),
	FormMessage: () => null,
}));

jest.mock('./context', () => ({
	useFormField: () => ({
		error: undefined,
		formItemNativeID: 'item-id',
		formDescriptionNativeID: 'desc-id',
		formMessageNativeID: 'msg-id',
	}),
}));

// Mirrors the real single-select ToggleGroup contract: re-pressing the selected
// item fires onValueChange(undefined), and root-level disabled blocks presses.
jest.mock('../toggle-group', () => {
	const React = require('react');
	return {
		ToggleGroup: ({ children, value, onValueChange, testID, disabled, ...props }: any) =>
			React.createElement(
				'div',
				{ role: 'group', 'data-value': value, 'data-testid': testID, ...props },
				React.Children.map(children, (child: any) =>
					React.cloneElement(child, {
						__groupValue: value,
						__onValueChange: onValueChange,
						__groupDisabled: disabled,
					})
				)
			),
		ToggleGroupItem: ({
			children,
			value,
			testID,
			disabled,
			__groupValue,
			__onValueChange,
			__groupDisabled,
		}: any) =>
			React.createElement(
				'button',
				{
					'data-testid': testID,
					'aria-pressed': __groupValue === value,
					disabled: !!(disabled || __groupDisabled),
					onClick: () => __onValueChange(__groupValue === value ? undefined : value),
				},
				children
			),
	};
});

jest.mock('../text', () => ({
	Text: ({ children }: any) => React.createElement('span', null, children),
}));

import { FormToggleGroup } from './toggle-group';

const OPTIONS = [
	{ label: 'Percentage', value: 'percent' },
	{ label: 'Amount off order', value: 'fixed_cart' },
];

describe('FormToggleGroup', () => {
	it('renders an option per entry and marks the selected one', () => {
		render(
			<FormToggleGroup
				name="type"
				onBlur={jest.fn()}
				value="percent"
				onChange={jest.fn()}
				options={OPTIONS}
			/>
		);
		expect(screen.getByText('Percentage')).toBeInTheDocument();
		expect(screen.getByText('Amount off order')).toBeInTheDocument();
		expect(screen.getByRole('button', { pressed: true })).toHaveTextContent('Percentage');
	});

	it('omits ARIA references when no label or description is rendered', () => {
		render(
			<FormToggleGroup
				name="type"
				onBlur={jest.fn()}
				value="percent"
				onChange={jest.fn()}
				options={OPTIONS}
			/>
		);
		const group = screen.getByRole('group');
		expect(group).not.toHaveAttribute('aria-labelledby');
		expect(group).not.toHaveAttribute('aria-describedby');
	});

	it('emits onChange with the pressed value', () => {
		const onChange = jest.fn();
		render(
			<FormToggleGroup
				name="type"
				onBlur={jest.fn()}
				value="percent"
				onChange={onChange}
				options={OPTIONS}
			/>
		);
		fireEvent.click(screen.getByText('Amount off order'));
		expect(onChange).toHaveBeenCalledWith('fixed_cart');
	});

	it('does not emit onChange(undefined) when the selected option is pressed again', () => {
		const onChange = jest.fn();
		render(
			<FormToggleGroup
				name="type"
				onBlur={jest.fn()}
				value="percent"
				onChange={onChange}
				options={OPTIONS}
			/>
		);
		fireEvent.click(screen.getByText('Percentage'));
		expect(onChange).not.toHaveBeenCalled();
	});

	it('derives per-option testIDs from the group testID', () => {
		render(
			<FormToggleGroup
				name="type"
				onBlur={jest.fn()}
				value="percent"
				onChange={jest.fn()}
				options={OPTIONS}
				testID="coupon-discount-type"
			/>
		);
		expect(screen.getByTestId('coupon-discount-type')).toBeInTheDocument();
		expect(screen.getByTestId('coupon-discount-type-percent')).toHaveTextContent('Percentage');
		expect(screen.getByTestId('coupon-discount-type-fixed_cart')).toHaveTextContent(
			'Amount off order'
		);
	});

	it('does not emit onChange when the group is disabled', () => {
		const onChange = jest.fn();
		render(
			<FormToggleGroup
				name="type"
				onBlur={jest.fn()}
				value="percent"
				onChange={onChange}
				options={OPTIONS}
				disabled
			/>
		);
		fireEvent.click(screen.getByText('Amount off order'));
		expect(onChange).not.toHaveBeenCalled();
	});
});
