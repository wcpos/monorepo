import * as React from 'react';

import get from 'lodash/get';
import debounce from 'lodash/debounce';
import { FieldValues, UseFormReturn } from 'react-hook-form';

import type { DebouncedFunc } from 'lodash';

interface UseFormChangeHandlerOptions<T extends FieldValues> {
	form: UseFormReturn<T>;
	onChange: (changes: Partial<T>) => void;
	/**
	 * Debounce delay in ms for text inputs. Set to 0 to disable.
	 * @default 300
	 */
	debounceMs?: number;
}

/**
 * Check if a value is a string (text input that should be debounced)
 */
function isTextValue(value: unknown): boolean {
	return typeof value === 'string';
}

/**
 * Hook to handle form field changes and persist them.
 *
 * Best practice: Use `values` prop in useForm instead of `defaultValues` + useEffect reset:
 * ```typescript
 * const form = useForm({
 *   values: formData,  // Reactive - auto-updates when formData changes
 *   resolver: zodResolver(schema),
 * });
 * useFormChangeHandler({ form, onChange: handleChange });
 * ```
 *
 * This hook:
 * - Debounces text input changes to avoid saving on every keystroke
 * - Ignores programmatic changes (reset, setValue on entire form)
 * - Only fires onChange for user-initiated field changes
 *
 * `onChange` may be an inline arrow (every ui-settings form passes one, and the React
 * Compiler deliberately skips any component that calls the `watch()` returned by
 * `useForm()` — its module type provider marks `watch` as knownIncompatible — so in those
 * forms nothing memoises it). The debounced writer therefore must NOT be keyed on
 * `onChange` identity: a form re-renders on the very field change it is persisting
 * (`useFormField` reads the root formState proxy), and a writer rebuilt on that render
 * would cancel the pending write — which is how every string-valued Select/ToggleGroup
 * setting (view mode, sort by, sort direction) silently stopped saving.
 *
 * The writer is built once per `debounceMs`, and each edit is queued TOGETHER with the
 * `onChange` that was current when the user made it (lodash invokes the last call's
 * arguments). So a pending write always lands on the persistence target of the edit —
 * a callback swapped in afterwards (a store switch while the form stays mounted) never
 * receives it — while an ordinary re-render, whose new callback targets the same store,
 * is unaffected.
 */
export function useFormChangeHandler<T extends FieldValues>({
	form,
	onChange,
	debounceMs = 300,
}: UseFormChangeHandlerOptions<T>) {
	const onChangeRef = React.useRef(onChange);
	React.useEffect(() => {
		onChangeRef.current = onChange;
	}, [onChange]);

	/**
	 * One debounced writer per delay, held in a ref so a re-render never replaces it.
	 * Unmount FLUSHES rather than cancels: closing the dialog within the debounce window
	 * must not lose the value the cashier just chose.
	 */
	type Write = (changes: Partial<T>, write: (changes: Partial<T>) => void) => void;
	const debouncedRef = React.useRef<DebouncedFunc<Write> | null>(null);
	React.useEffect(() => {
		const debounced = debounce<Write>((changes, write) => {
			write(changes);
		}, debounceMs);
		debouncedRef.current = debounced;
		return () => {
			debounced.flush();
			if (debouncedRef.current === debounced) debouncedRef.current = null;
		};
	}, [debounceMs]);

	/**
	 * Subscribe to form field changes and persist them.
	 * This is a legitimate useEffect for subscribing to an external store (RHF watch).
	 *
	 * Programmatic resets are ignored automatically: when `form.reset()` runs (or the
	 * `values` prop changes, which calls reset internally), RHF emits a single
	 * form-level update whose `name` is `undefined`. User-initiated edits always carry
	 * a defined `name`, so the `if (name)` guard below skips reset/programmatic updates
	 * without needing to intercept `form.reset`.
	 */
	React.useEffect(() => {
		const subscription = form.watch((values, { name }) => {
			const debounced = debouncedRef.current;
			// Only handle changes when a specific field is changed by the user.
			// When `name` is undefined, it means the entire form was reset/set programmatically
			if (!name) {
				debounced?.cancel();
				return;
			}

			const value = get(values, name);
			const changes = { [name]: value } as unknown as Partial<T>;

			// Debounce text inputs to avoid saving on every keystroke
			if (isTextValue(value) && debounceMs > 0 && debounced) {
				debounced(changes, onChangeRef.current);
			} else {
				// Flush any pending debounced changes first
				debounced?.flush();
				onChangeRef.current(changes);
			}
		});

		return () => subscription.unsubscribe();
	}, [form, debounceMs]);
}
