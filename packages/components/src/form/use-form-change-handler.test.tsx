import * as React from 'react';

import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
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

it('persists a debounced string change even when the change re-renders the form', async () => {
	const onChange = jest.fn();
	const onRender = jest.fn();
	const view = render(<Harness onChange={onChange} onRender={onRender} />);

	await act(async () => {
		view.getByTestId('pick').click();
	});
	// Precondition for the regression: the field change re-rendered the harness.
	expect(onRender.mock.calls.length).toBeGreaterThan(1);

	await act(async () => {
		jest.advanceTimersByTime(1000);
	});

	expect(onChange).toHaveBeenCalledWith({ viewMode: 'grid' });
});

it('flushes a pending debounced change on unmount', async () => {
	const onChange = jest.fn();
	const view = render(<Harness onChange={onChange} onRender={() => {}} />);

	await act(async () => {
		view.getByTestId('pick').click();
	});
	await act(async () => view.unmount());

	expect(onChange).toHaveBeenCalledWith({ viewMode: 'grid' });
});

it('delivers to the onChange current at the time of the edit, not the first render', async () => {
	const first = jest.fn();
	const second = jest.fn();
	const view = render(<Harness onChange={first} onRender={() => {}} />);
	view.rerender(<Harness onChange={second} onRender={() => {}} />);

	await act(async () => {
		view.getByTestId('pick').click();
	});
	await act(async () => {
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
it('does not retarget a pending write to an onChange swapped in after the edit', async () => {
	const editTime = jest.fn();
	const afterwards = jest.fn();
	const view = render(<Harness onChange={editTime} onRender={() => {}} />);

	await act(async () => {
		view.getByTestId('pick').click();
	});
	view.rerender(<Harness onChange={afterwards} onRender={() => {}} />);
	await act(async () => {
		jest.advanceTimersByTime(1000);
	});

	expect(editTime).toHaveBeenCalledWith({ viewMode: 'grid' });
	expect(afterwards).not.toHaveBeenCalled();
});

/**
 * After a store patch lands, the reset's `values` make react-hook-form emit a NAMED event per
 * control that normalises its value, carrying the value the form already holds (five idempotent
 * writes per edit on General, seen 2026-09-30). `setValue` with an equal value emits nothing in
 * jsdom, so the sequence observed live is replayed through a stub form's watch callback.
 */
it('ignores a named event whose value equals the last one seen for that field', async () => {
	type Cb = (values: Record<string, unknown>, info: { name?: string }) => void;
	let emit: Cb = () => {};
	const values: Record<string, unknown> = {
		name: 'Shop',
		price_num_decimals: 2,
		locale: 'es_ES',
		columns: [{ show: true }],
	};
	const form = {
		getValues: () => values,
		trigger: async () => true,
		watch: (cb: Cb) => {
			emit = cb;
			return { unsubscribe: () => {} };
		},
	} as unknown as Parameters<typeof useFormChangeHandler>[0]['form'];
	const onChange = jest.fn();
	function Stub() {
		useFormChangeHandler({ form, onChange, debounceMs: 0 });
		return null;
	}
	render(<Stub />);

	// A nested edit first, made IN PLACE on the object getValues() returned — the way
	// react-hook-form's setValue mutates _formValues. The seed must be a deep clone, or
	// lastSeen already holds the new value and the edit is skipped.
	await act(async () => {
		(values.columns as { show: boolean }[])[0].show = false;
		emit(values, { name: 'columns.0.show' });
	});
	expect(onChange).toHaveBeenCalledTimes(1);
	expect(onChange).toHaveBeenLastCalledWith({ 'columns.0.show': false });

	// The user's edit.
	values.name = 'Shop two';
	await act(async () => emit(values, { name: 'name' }));
	expect(onChange).toHaveBeenCalledTimes(2);
	expect(onChange).toHaveBeenLastCalledWith({ name: 'Shop two' });

	// The store patch lands: a form-level reset, then the echoes — a numeric input's number as a
	// string, a select's unchanged key — and the name and the nested field again.
	await act(async () => {
		emit(values, { name: undefined });
		emit({ ...values, price_num_decimals: '2' }, { name: 'price_num_decimals' });
		emit(values, { name: 'locale' });
		emit(values, { name: 'name' });
		emit(values, { name: 'columns.0.show' });
	});
	expect(onChange).toHaveBeenCalledTimes(2);
});

function ValidatedHarness({
	value,
	onChange,
}: {
	value: string;
	onChange: (changes: object) => void;
}) {
	const form = useForm({
		defaultValues: { name: 'Original' },
		resolver: zodResolver(z.object({ name: z.string().min(3) })),
	});
	useFormChangeHandler({ form, onChange });
	return <button data-testid="change" onClick={() => form.setValue('name', value)} />;
}

it('never writes an invalid value rejected by the resolver', async () => {
	const onChange = jest.fn();
	const view = render(<ValidatedHarness value="x" onChange={onChange} />);
	await act(async () => {
		view.getByTestId('change').click();
		jest.advanceTimersByTime(300);
	});
	expect(onChange).not.toHaveBeenCalled();
});

it('writes a valid value accepted by the resolver', async () => {
	const onChange = jest.fn();
	const view = render(<ValidatedHarness value="Valid" onChange={onChange} />);
	await act(async () => {
		view.getByTestId('change').click();
		jest.advanceTimersByTime(300);
	});
	expect(onChange).toHaveBeenCalledWith({ name: 'Valid' });
});

function FlushHarness({
	onChange,
	onFlushReady,
}: {
	onChange: (changes: object) => Promise<void>;
	onFlushReady: (flush: () => Promise<boolean>) => void;
}) {
	const form = useForm({ defaultValues: { name: 'Original' } });
	const { flush } = useFormChangeHandler({ form, onChange });
	React.useEffect(() => {
		onFlushReady(flush);
	}, [flush, onFlushReady]);
	return <button data-testid="change" onClick={() => form.setValue('name', 'Typed')} />;
}

it('flush resolves after the pending write has landed', async () => {
	let landed = false;
	const onChange = jest.fn(
		() =>
			new Promise<void>((resolve) =>
				setTimeout(() => {
					landed = true;
					resolve();
				}, 50)
			)
	);
	const flushRef: { current: (() => Promise<boolean>) | null } = { current: null };
	const view = render(
		<FlushHarness
			onChange={onChange}
			onFlushReady={(flush) => {
				flushRef.current = flush;
			}}
		/>
	);
	await act(async () => {
		view.getByTestId('change').click();
	});
	// Within the debounce window: nothing written yet, and flush must not wait for the timer.
	expect(onChange).not.toHaveBeenCalled();
	let flushed: boolean | null = null;
	const flushing = flushRef.current!().then((landed) => {
		flushed = landed;
	});
	await act(async () => {
		await Promise.resolve();
	});
	expect(onChange).toHaveBeenCalledWith({ name: 'Typed' });
	expect(flushed).toBeNull();
	await act(async () => {
		jest.advanceTimersByTime(50);
		await flushing;
	});
	expect(landed).toBe(true);
	expect(flushed).toBe(true);
});

function ImmediateHarness({ value, onChange }: { value: number; onChange: (c: object) => void }) {
	const form = useForm({
		defaultValues: { qty: 1 },
		resolver: zodResolver(z.object({ qty: z.number().min(1) })),
	});
	useFormChangeHandler({ form, onChange });
	return <button data-testid="change" onClick={() => form.setValue('qty', value)} />;
}

it('gates the immediate (non-text) path too: an invalid number is never written', async () => {
	const onChange = jest.fn();
	const view = render(<ImmediateHarness value={0} onChange={onChange} />);
	await act(async () => {
		view.getByTestId('change').click();
	});
	expect(onChange).not.toHaveBeenCalled();
});

function TwoTextHarness({ onChange }: { onChange: (c: object) => void }) {
	const form = useForm({ defaultValues: { name: 'a', city: 'b' } });
	useFormChangeHandler({ form, onChange });
	return (
		<>
			<button data-testid="name" onClick={() => form.setValue('name', 'Shop')} />
			<button data-testid="city" onClick={() => form.setValue('city', 'Perth')} />
		</>
	);
}

it('a second text field edited inside the debounce window does not drop the first field’s write', async () => {
	const onChange = jest.fn();
	const view = render(<TwoTextHarness onChange={onChange} />);
	await act(async () => {
		view.getByTestId('name').click();
		jest.advanceTimersByTime(100);
		view.getByTestId('city').click();
		jest.advanceTimersByTime(300);
	});
	expect(onChange).toHaveBeenCalledWith({ name: 'Shop' });
	expect(onChange).toHaveBeenCalledWith({ city: 'Perth' });
});

it('flush resolves false when the pending write reports a failure', async () => {
	const onChange = jest.fn(() => Promise.resolve(false));
	const flushRef: { current: (() => Promise<boolean>) | null } = { current: null };
	const view = render(
		<FlushHarness
			onChange={onChange as unknown as (changes: object) => Promise<void>}
			onFlushReady={(flush) => {
				flushRef.current = flush;
			}}
		/>
	);
	await act(async () => {
		view.getByTestId('change').click();
	});
	let landed: boolean | null = null;
	await act(async () => {
		landed = await flushRef.current!();
	});
	expect(onChange).toHaveBeenCalled();
	expect(landed).toBe(false);
});
