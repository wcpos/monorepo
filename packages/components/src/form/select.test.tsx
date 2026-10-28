/**
 * @jest-environment jsdom
 */
import * as React from 'react';

import { fireEvent, render, screen } from '@testing-library/react';
import { FormProvider, useForm } from 'react-hook-form';

import { FormFieldContext } from './context';
import { FormSelect } from './select';

/**
 * FormSelect hands the field's scalar to the control and the control's scalar back to the
 * field: no Option is built on the way in or unpicked on the way out. `./common` pulls in
 * reanimated and draws only the scaffold; `OptionSelect` is a stub that shows what it was
 * handed and picks or clears the way the real one reports it, `(value, option)`.
 */
jest.mock('./common', () => {
	const R = require('react');
	const passthrough = ({ children }: { children?: React.ReactNode }) =>
		R.createElement('div', null, children);
	return {
		FormItem: passthrough,
		FormLabel: passthrough,
		FormDescription: passthrough,
		FormMessage: () => null,
	};
});

type ControlProps = {
	options: { value: string; label: string }[];
	value?: string;
	onChange?: (value: string | undefined, option?: { value: string; label: string }) => void;
	fallbackLabel?: string;
	matchWidth?: boolean;
	placeholder: string;
};

function StubSelect({ options, onChange, ...props }: ControlProps) {
	return (
		<div data-testid="control" data-props={JSON.stringify(props)}>
			{options.map((option) => (
				<button key={option.value} onClick={() => onChange?.(option.value, option)}>
					{option.label}
				</button>
			))}
			<button onClick={() => onChange?.(undefined, undefined)}>clear</button>
		</div>
	);
}
jest.mock('../select', () => ({ OptionSelect: (props: ControlProps) => StubSelect(props) }));

const STATUSES = [
	{ value: 'publish', label: 'Active' },
	{ value: 'draft', label: 'Draft' },
];

function Harness(props: { value: string; onChange: (value: string) => void; custom?: boolean }) {
	const form = useForm({ defaultValues: { status: props.value } });
	return (
		<FormProvider {...form}>
			<FormFieldContext.Provider value={{ name: 'status' }}>
				<FormSelect
					name="status"
					onBlur={jest.fn()}
					value={props.value}
					onChange={props.onChange}
					options={STATUSES}
					placeholder="Select status"
					{...(props.custom ? { customComponent: StubSelect } : {})}
				/>
			</FormFieldContext.Provider>
		</FormProvider>
	);
}

const handed = () => JSON.parse(screen.getByTestId('control').getAttribute('data-props')!);

describe.each([
	['OptionSelect', false],
	['a customComponent', true],
])('FormSelect drawing %s', (_name, custom) => {
	it('hands the scalar in as it is, the list as wide as the trigger', () => {
		render(<Harness value="draft" onChange={jest.fn()} custom={custom} />);
		expect(handed()).toEqual({
			name: 'status',
			'aria-invalid': false,
			value: 'draft',
			placeholder: 'Select status',
			matchWidth: true,
			fallbackLabel: 'draft',
		});
	});

	it('writes the picked scalar, and a clear as the empty string', () => {
		const onChange = jest.fn();
		render(<Harness value="draft" onChange={onChange} custom={custom} />);
		fireEvent.click(screen.getByText('Active'));
		fireEvent.click(screen.getByText('clear'));
		expect(onChange.mock.calls).toEqual([['publish'], ['']]);
		expect(JSON.stringify({ status: onChange.mock.calls[1][0] })).toBe('{"status":""}');
	});
});
