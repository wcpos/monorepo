import * as React from 'react';

import { act, render } from '@testing-library/react';
import { useForm, useWatch } from 'react-hook-form';

import { useFormChangeHandler } from './use-form-change-handler';

type Values = { viewMode: string; enabled: boolean; columns?: string[] };

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
	const form = useForm<Values>({
		values: { viewMode: 'table', enabled: false, columns: ['a', 'b'] },
	});
	onRender();
	useFormChangeHandler({ form, onChange: (changes) => onChange(changes) });
	// Subscribe this component to the field so the change re-renders it (useWatch, not form.watch: the latter is lint-banned and opts the component out of the compiler).
	useWatch({ control: form.control, name: 'viewMode' });
	return (
		<>
			<button
				type="button"
				data-testid="pick"
				onClick={() => form.setValue('viewMode', 'grid', { shouldDirty: true })}
			/>
			<button
				type="button"
				data-testid="echo"
				onClick={() => form.setValue('viewMode', 'table', { shouldDirty: true })}
			/>
			<button
				type="button"
				data-testid="toggle-same"
				onClick={() => form.setValue('enabled', false, { shouldDirty: true })}
			/>
			<button
				type="button"
				data-testid="columns-same"
				onClick={() => form.setValue('columns', ['a', 'b'], { shouldDirty: true })}
			/>
			<button
				type="button"
				data-testid="columns-new"
				onClick={() => form.setValue('columns', ['a', 'c'], { shouldDirty: true })}
			/>
		</>
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

/**
 * After a store patch lands, the reset's `values` make react-hook-form emit a NAMED event per
 * control that normalises its value, carrying the value the form already held. Those are not
 * changes and must not be written back (five idempotent writes per edit on General, 2026-09-30).
 */
it('ignores a named event whose value equals the last one seen for that field', () => {
	const onChange = jest.fn();
	const view = render(<Harness onChange={onChange} onRender={jest.fn()} />);

	act(() => {
		view.getByTestId('echo').click(); // viewMode is already 'table'
		view.getByTestId('toggle-same').click(); // enabled is already false
		view.getByTestId('columns-same').click(); // a new array, structurally the same
		jest.advanceTimersByTime(1000);
	});
	expect(onChange).not.toHaveBeenCalled();

	act(() => {
		view.getByTestId('columns-new').click();
		jest.advanceTimersByTime(1000);
	});
	expect(onChange).toHaveBeenCalledTimes(1);
	expect(onChange).toHaveBeenCalledWith({ columns: ['a', 'c'] });
});
