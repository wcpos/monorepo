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
 * `FormSelect` and `FormCombobox` were near-identical 71-line files that differed only
 * in the control they default to — and where they had silently diverged, on the clear
 * path, it was a real defect (#1501). They now share `FormOptionControl`.
 *
 * This file is what keeps them from drifting apart again: every assertion runs against
 * both, through the `customComponent` seam so the real shared body executes. The
 * clear-path parity from #1501 keeps its own file; what is pinned here is the rest of
 * the shared contract — the scalar/Option conversion and the aria wiring.
 *
 * `./common` pulls in react-native-reanimated, which this preset does not transform,
 * and the wrappers it exports are purely presentational. The Select/Combobox modules
 * are stubbed because the test injects its own control, so the real ones never render.
 */
jest.mock('./common', () => {
	const R = require('react');
	const passthrough = ({ children }: { children?: React.ReactNode }) =>
		R.createElement('div', null, children);
	return {
		FormItem: passthrough,
		FormLabel: ({ children, nativeID }: { children?: React.ReactNode; nativeID?: string }) =>
			R.createElement('label', { id: nativeID }, children),
		FormDescription: passthrough,
		FormMessage: () => null,
	};
});

jest.mock('../select', () => ({ Select: () => null }));
jest.mock('../combobox', () => ({ Combobox: () => null }));

type ControlProps = {
	value?: unknown;
	multiple?: boolean;
	onValueChange?: (value: unknown) => void;
};

/**
 * Stands in for Select/Combobox via the `customComponent` seam and reports back what
 * the shared body handed it, so the assertions read the real conversion rather than a
 * mock of it.
 */
function StubControl({ value, multiple, ...rest }: ControlProps & Record<string, unknown>) {
	return (
		<div
			data-testid="control"
			data-value={JSON.stringify(value ?? null)}
			data-multiple={String(!!multiple)}
			aria-labelledby={rest['aria-labelledby'] as string | undefined}
			aria-describedby={rest['aria-describedby'] as string | undefined}
			aria-invalid={rest['aria-invalid'] as boolean | undefined}
		/>
	);
}

function Harness({
	Field,
	fieldProps,
}: {
	Field: React.ComponentType<any>;
	fieldProps: Record<string, unknown>;
}) {
	const form = useForm({ defaultValues: { country: 'AU' } });

	return (
		<FormProvider {...form}>
			<FormFieldContext.Provider value={{ name: 'country' }}>
				<Field
					name="country"
					onChange={jest.fn()}
					onBlur={jest.fn()}
					customComponent={StubControl}
					{...fieldProps}
				/>
			</FormFieldContext.Provider>
		</FormProvider>
	);
}

const control = () => screen.getByTestId('control');
const passedValue = () => JSON.parse(control().getAttribute('data-value') as string);

describe.each([
	['FormSelect', FormSelect],
	['FormCombobox', FormCombobox],
] as const)('%s shared body', (_name, Field) => {
	it('lifts a scalar field value into an Option for the control', () => {
		render(<Harness Field={Field} fieldProps={{ value: 'AU' }} />);

		expect(passedValue()).toEqual({ value: 'AU', label: 'AU' });
	});

	/**
	 * The escape hatch `orders/edit/form.tsx` and `settings/general.tsx` rely on: a
	 * customer id cannot produce its own label, so the caller supplies the pair. The
	 * body has always passed it through; before the consolidation the prop type said
	 * `string`, which is what drove those two call sites to cast.
	 */
	it('passes a caller-supplied Option through untouched', () => {
		render(
			<Harness Field={Field} fieldProps={{ value: { value: '42', label: 'Ada Lovelace' } }} />
		);

		expect(passedValue()).toEqual({ value: '42', label: 'Ada Lovelace' });
	});

	/**
	 * Multi-select is not part of this wrapper's contract — it goes through the raw
	 * `Combobox`/`TreeCombobox` or `FormTreeCombobox`. `multiple` stays in the props
	 * `Omit` so it cannot reach the control and turn the scalar value into an array.
	 */
	it('does not forward multiple to the control', () => {
		render(<Harness Field={Field} fieldProps={{ value: 'AU' }} />);

		expect(control().getAttribute('data-multiple')).toBe('false');
	});

	/**
	 * `aria-describedby` names the description and validation-message nodes, neither of
	 * which is rendered for a field with no description and no error. Eight wrappers
	 * used to emit both ids unconditionally, pointing assistive technology at elements
	 * that are not in the tree; `useFormControlAria` now emits each only when its node
	 * exists.
	 */
	it('omits aria ids for nodes that are not rendered', () => {
		render(<Harness Field={Field} fieldProps={{ value: 'AU' }} />);

		expect(control()).not.toHaveAttribute('aria-labelledby');
		expect(control()).not.toHaveAttribute('aria-describedby');
	});

	it('points the control at the label and description that are rendered', () => {
		render(
			<Harness
				Field={Field}
				fieldProps={{ value: 'AU', label: 'Country', description: 'Where you trade' }}
			/>
		);

		const labelledBy = control().getAttribute('aria-labelledby');
		expect(labelledBy).toBeTruthy();
		expect(screen.getByText('Country')).toHaveAttribute('id', labelledBy);
		expect(control().getAttribute('aria-describedby')).toBeTruthy();
	});
});
