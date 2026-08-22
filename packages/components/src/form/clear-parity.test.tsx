/**
 * @jest-environment jsdom
 */
import * as React from 'react';

import { render, screen } from '@testing-library/react';
import { FormProvider, useForm } from 'react-hook-form';

import { FormCombobox } from './combobox';
import { FormFieldContext } from './context';
import { FormSelect } from './select';

/**
 * `./common` pulls in react-native-reanimated, which this preset does not transform,
 * and the wrappers it exports are purely presentational. The Select/Combobox modules
 * are stubbed for the same reason — the test injects its own control below, so the
 * real ones are never rendered.
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

jest.mock('../select', () => ({ Select: () => null }));
jest.mock('../combobox', () => ({ Combobox: () => null }));

/**
 * Stands in for the Select/Combobox control via the `customComponent` seam, so the
 * test drives the real FormSelect/FormCombobox change handlers rather than a mock of
 * them. The clear button emits what a control emits when its selection is removed:
 * `undefined`.
 */
function StubControl({ onValueChange }: { onValueChange?: (v: undefined) => void }) {
	return <button data-testid="clear" onClick={() => onValueChange?.(undefined)} />;
}

/**
 * The minimal props both form components accept. Typed rather than `any` so that a
 * later incompatible change to either component's prop contract breaks this file
 * instead of silently passing invalid props through a widened seam.
 */
type SharedFieldProps = {
	name: string;
	value: string;
	onChange: (value: unknown) => void;
	onBlur: () => void;
	customComponent: React.ComponentType<{ onValueChange?: (v: undefined) => void }>;
	label: string;
};

function Harness({
	Field,
	onChange,
}: {
	Field: React.ComponentType<SharedFieldProps>;
	onChange: (value: unknown) => void;
}) {
	const form = useForm({ defaultValues: { country: 'AU' } });

	return (
		<FormProvider {...form}>
			<FormFieldContext.Provider value={{ name: 'country' }}>
				<Field
					name="country"
					value="AU"
					onChange={onChange}
					onBlur={jest.fn()}
					customComponent={StubControl}
					label="Country"
				/>
			</FormFieldContext.Provider>
		</FormProvider>
	);
}

describe.each([
	['FormSelect', FormSelect],
	['FormCombobox', FormCombobox],
] as const)('%s', (_name, Field) => {
	it('emits the empty string when the selection is cleared, never undefined', () => {
		const onChange = jest.fn();
		render(<Harness Field={Field} onChange={onChange} />);

		screen.getByTestId('clear').click();

		expect(onChange).toHaveBeenCalledWith('');

		// The distinction that matters: `useFormChangeHandler` turns this into a
		// `{ country: <value> }` patch, and JSON.stringify drops an undefined key —
		// so an undefined here reaches the server as no change instead of a clear.
		const [emitted] = onChange.mock.calls[0];
		expect(JSON.stringify({ country: emitted })).toBe('{"country":""}');
	});
});
