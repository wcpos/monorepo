/* eslint-disable import/first, @typescript-eslint/no-require-imports */
import * as React from 'react';

import { fireEvent, render, screen } from '@testing-library/react';

let mockError: { message: string } | undefined;

jest.mock('./common', () => ({
	FormItem: ({ children }: any) => React.createElement('div', null, children),
	FormLabel: ({ children, nativeID }: any) =>
		React.createElement('label', { id: nativeID }, children),
	FormDescription: ({ children }: any) => React.createElement('p', { id: 'desc-id' }, children),
	FormMessage: () =>
		mockError ? React.createElement('p', { id: 'msg-id' }, mockError.message) : null,
}));

jest.mock('./context', () => ({
	useFormField: () => ({
		error: mockError,
		formItemNativeID: 'item-id',
		formDescriptionNativeID: 'desc-id',
		formMessageNativeID: 'msg-id',
	}),
}));

// Mirrors the real single-select ToggleGroup contract: re-pressing the selected
// item fires onValueChange(undefined). Root and item disabled props stay
// independent so the tests can verify that FormToggleGroup forwards both.
jest.mock('../toggle-group', () => {
	const React = require('react');
	return {
		ToggleGroup: ({ children, value, onValueChange, testID, disabled, ...props }: any) =>
			React.createElement(
				'div',
				{
					role: 'group',
					'data-value': value,
					'data-testid': testID,
					'aria-disabled': disabled,
					...props,
				},
				React.Children.map(children, (child: any) =>
					React.cloneElement(child, {
						__groupValue: value,
						__onValueChange: onValueChange,
					})
				)
			),
		ToggleGroupItem: ({ children, value, testID, disabled, __groupValue, __onValueChange }: any) =>
			React.createElement(
				'button',
				{
					'data-testid': testID,
					'data-item-disabled': disabled ? 'true' : undefined,
					'aria-pressed': __groupValue === value,
					disabled,
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
	beforeEach(() => {
		mockError = undefined;
	});

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
		expect(group).toHaveAttribute('aria-invalid', 'false');
	});

	it('references only the rendered label and description', () => {
		render(
			<FormToggleGroup
				name="type"
				onBlur={jest.fn()}
				value="percent"
				onChange={jest.fn()}
				options={OPTIONS}
				label="Discount type"
				description="Choose a discount type"
			/>
		);
		const group = screen.getByRole('group');
		expect(group).toHaveAttribute('aria-labelledby', 'item-id');
		expect(group).toHaveAttribute('aria-describedby', 'desc-id');
		expect(group).toHaveAttribute('aria-invalid', 'false');
	});

	it('references only the rendered error message when invalid', () => {
		mockError = { message: 'Discount type is required' };
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
		expect(group).toHaveAttribute('aria-describedby', 'msg-id');
		expect(group).toHaveAttribute('aria-invalid', 'true');
	});

	it('references both the rendered description and error message when invalid', () => {
		mockError = { message: 'Discount type is required' };
		render(
			<FormToggleGroup
				name="type"
				onBlur={jest.fn()}
				value="percent"
				onChange={jest.fn()}
				options={OPTIONS}
				label="Discount type"
				description="Choose a discount type"
			/>
		);
		const group = screen.getByRole('group');
		expect(group).toHaveAttribute('aria-labelledby', 'item-id');
		expect(group).toHaveAttribute('aria-describedby', 'desc-id msg-id');
		expect(group).toHaveAttribute('aria-invalid', 'true');
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
		expect(screen.getByRole('group')).toHaveAttribute('aria-disabled', 'true');
		fireEvent.click(screen.getByText('Amount off order'));
		expect(onChange).not.toHaveBeenCalled();
		for (const item of screen.getAllByRole('button')) {
			expect(item).toHaveAttribute('data-item-disabled', 'true');
		}
	});
});
