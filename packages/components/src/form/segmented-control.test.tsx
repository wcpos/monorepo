import * as React from 'react';

import { act, fireEvent, render, screen } from '@testing-library/react';

import { FormSegmentedControl } from './segmented-control';

let mockError: { message: string } | undefined;

jest.mock('./common', () => {
	const ReactActual = jest.requireActual<typeof import('react')>('react');
	return {
		FormItem: ({ children }: { children: React.ReactNode }) =>
			ReactActual.createElement('div', null, children),
		FormLabel: ({ children, nativeID }: { children: React.ReactNode; nativeID: string }) =>
			ReactActual.createElement('label', { id: nativeID }, children),
		FormDescription: ({ children }: { children: React.ReactNode }) =>
			ReactActual.createElement('p', { id: 'desc-id' }, children),
		FormMessage: () =>
			mockError ? ReactActual.createElement('p', { id: 'msg-id' }, mockError.message) : null,
	};
});

jest.mock('./context', () => ({
	FormItemContext: jest.requireActual<typeof import('react')>('react').createContext({}),
	useFormField: () => ({
		error: mockError,
		formItemNativeID: 'item-id',
		formDescriptionNativeID: 'desc-id',
		formMessageNativeID: 'msg-id',
	}),
}));

// The real SegmentedControl on RNW; only Icon is stubbed.
jest.mock('../icon', () => ({ Icon: () => null }));

const SEGMENTS = [
	{ label: 'Percentage', value: 'percent' },
	{ label: 'Amount off order', value: 'fixed_cart' },
] as const;

function Field(props: Partial<React.ComponentProps<typeof FormSegmentedControl>>) {
	return (
		<FormSegmentedControl
			name="type"
			onBlur={jest.fn()}
			value="percent"
			onChange={jest.fn()}
			segments={SEGMENTS}
			{...props}
		/>
	);
}

describe('FormSegmentedControl', () => {
	beforeEach(() => {
		mockError = undefined;
	});

	it('renders a segment per entry and marks the selected one', () => {
		render(<Field />);
		expect(screen.getByRole('radio', { checked: true })).toHaveTextContent('Percentage');
		expect(screen.getByRole('radio', { checked: false })).toHaveTextContent('Amount off order');
	});

	it('omits ARIA references when no label or description is rendered', () => {
		render(<Field />);
		const group = screen.getByRole('radiogroup');
		expect(group).not.toHaveAttribute('aria-labelledby');
		expect(group).not.toHaveAttribute('aria-describedby');
		expect(group).toHaveAttribute('aria-invalid', 'false');
	});

	it('references only the rendered label and description', () => {
		render(<Field label="Discount type" description="Choose a discount type" />);
		const group = screen.getByRole('radiogroup');
		expect(group).toHaveAttribute('aria-labelledby', 'item-id');
		expect(group).toHaveAttribute('aria-describedby', 'desc-id');
		expect(group).toHaveAttribute('aria-invalid', 'false');
	});

	it('references both the rendered description and error message when invalid', () => {
		mockError = { message: 'Discount type is required' };
		render(<Field label="Discount type" description="Choose a discount type" />);
		const group = screen.getByRole('radiogroup');
		expect(group).toHaveAttribute('aria-describedby', 'desc-id msg-id');
		expect(group).toHaveAttribute('aria-invalid', 'true');
	});

	it('emits onChange with the pressed value, and never for the selected one', () => {
		const onChange = jest.fn();
		render(<Field onChange={onChange} />);
		fireEvent.click(screen.getByText('Percentage'));
		expect(onChange).not.toHaveBeenCalled();
		fireEvent.click(screen.getByText('Amount off order'));
		expect(onChange).toHaveBeenCalledWith('fixed_cart');
	});

	it('derives per-segment testIDs from the field testID', () => {
		render(<Field testID="coupon-discount-type" />);
		expect(screen.getByTestId('coupon-discount-type')).toBeInTheDocument();
		expect(screen.getByTestId('coupon-discount-type-percent')).toHaveTextContent('Percentage');
		expect(screen.getByTestId('coupon-discount-type-fixed_cart')).toHaveTextContent(
			'Amount off order'
		);
	});

	it('forwards the controller blur and ref to the control', () => {
		const onBlur = jest.fn();
		const ref = React.createRef<{ focus: () => void }>();
		render(<Field onBlur={onBlur} ref={ref} testID="field" />);
		act(() => ref.current?.focus());
		expect(screen.getByTestId('field-percent')).toHaveFocus();
		fireEvent.blur(screen.getByTestId('field-fixed_cart'));
		expect(onBlur).toHaveBeenCalled();
	});

	it('leaves the tab order when the field is disabled', () => {
		render(<Field disabled />);
		for (const segment of screen.getAllByRole('radio')) {
			expect(segment).toHaveAttribute('tabindex', '-1');
		}
	});

	it('disables every segment when the field is disabled', () => {
		const onChange = jest.fn();
		render(<Field onChange={onChange} disabled />);
		expect(screen.getByRole('radiogroup')).toHaveAttribute('aria-disabled', 'true');
		fireEvent.click(screen.getByText('Amount off order'));
		expect(onChange).not.toHaveBeenCalled();
		for (const segment of screen.getAllByRole('radio')) {
			expect(segment).toHaveAttribute('aria-disabled', 'true');
		}
	});
});
