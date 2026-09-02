import * as React from 'react';

import { act, render } from '@testing-library/react';
import { useForm, useWatch } from 'react-hook-form';

import { useFormChangeHandler } from './use-form-change-handler';

type Values = { viewMode: string; enabled: boolean };

/**
 * Mirrors the production call sites (the ui-settings forms): `onChange` is an inline
 * arrow, so it is a NEW function on every render, and the component re-renders on the
 * field change it is persisting (`useFormField` reads the root formState proxy).
 */
function Harness({
	onChange,
	onRender,
}: {
	onChange: (changes: Partial<Values>) => void;
	onRender: () => void;
}) {
	const form = useForm<Values>({ values: { viewMode: 'table', enabled: false } });
	onRender();
	useFormChangeHandler({ form, onChange: (changes) => onChange(changes) });
	// Subscribe this component to the field so the change re-renders it (useWatch, not form.watch: the latter is lint-banned and opts the component out of the compiler).
	useWatch({ control: form.control, name: 'viewMode' });
	return (
		<button
			type="button"
			data-testid="pick"
			onClick={() => form.setValue('viewMode', 'grid', { shouldDirty: true })}
		/>
	);
}

beforeEach(() => {
	jest.useFakeTimers();
});

afterEach(() => {
	jest.useRealTimers();
});

it('persists a debounced string change even when the change re-renders the form', () => {
	const onChange = jest.fn();
	const onRender = jest.fn();
	const view = render(<Harness onChange={onChange} onRender={onRender} />);

	act(() => {
		view.getByTestId('pick').click();
	});
	// Precondition for the regression: the field change re-rendered the harness.
	expect(onRender.mock.calls.length).toBeGreaterThan(1);

	act(() => {
		jest.advanceTimersByTime(1000);
	});

	expect(onChange).toHaveBeenCalledWith({ viewMode: 'grid' });
});

it('flushes a pending debounced change on unmount', () => {
	const onChange = jest.fn();
	const view = render(<Harness onChange={onChange} onRender={() => {}} />);

	act(() => {
		view.getByTestId('pick').click();
	});
	view.unmount();

	expect(onChange).toHaveBeenCalledWith({ viewMode: 'grid' });
});

it('delivers to the onChange current at the time of the edit, not the first render', () => {
	const first = jest.fn();
	const second = jest.fn();
	const view = render(<Harness onChange={first} onRender={() => {}} />);
	view.rerender(<Harness onChange={second} onRender={() => {}} />);

	act(() => {
		view.getByTestId('pick').click();
	});
	act(() => {
		jest.advanceTimersByTime(1000);
	});

	expect(first).not.toHaveBeenCalled();
	expect(second).toHaveBeenCalledWith({ viewMode: 'grid' });
});

/**
 * A callback swapped in AFTER the edit (the persistence target changed while the form
 * stayed mounted) must not receive the pending write: it belongs to the target the user
 * was editing.
 */
it('does not retarget a pending write to an onChange swapped in after the edit', () => {
	const editTime = jest.fn();
	const afterwards = jest.fn();
	const view = render(<Harness onChange={editTime} onRender={() => {}} />);

	act(() => {
		view.getByTestId('pick').click();
	});
	view.rerender(<Harness onChange={afterwards} onRender={() => {}} />);
	act(() => {
		jest.advanceTimersByTime(1000);
	});

	expect(editTime).toHaveBeenCalledWith({ viewMode: 'grid' });
	expect(afterwards).not.toHaveBeenCalled();
});
