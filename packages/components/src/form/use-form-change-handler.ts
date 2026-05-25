import * as React from 'react';

import get from 'lodash/get';
import debounce from 'lodash/debounce';
import { FieldValues, UseFormReturn } from 'react-hook-form';

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
 */
export function useFormChangeHandler<T extends FieldValues>({
	form,
	onChange,
	debounceMs = 300,
}: UseFormChangeHandlerOptions<T>) {
	// Create a debounced version for text inputs
	const debouncedOnChange = React.useMemo(
		() =>
			debounce((changes: Partial<T>) => {
				onChange(changes);
			}, debounceMs),
		[onChange, debounceMs]
	);

	/**
	 * Cleanup debounced function on unmount to prevent memory leaks.
	 * This is a legitimate useEffect for resource cleanup.
	 */
	React.useEffect(() => {
		return () => {
			debouncedOnChange.cancel();
		};
	}, [debouncedOnChange]);

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
			// Only handle changes when a specific field is changed by the user.
			// When `name` is undefined, it means the entire form was reset/set programmatically
			if (!name) {
				debouncedOnChange.cancel();
				return;
			}

			const value = get(values, name);
			const changes = { [name]: value } as unknown as Partial<T>;

			// Debounce text inputs to avoid saving on every keystroke
			if (isTextValue(value) && debounceMs > 0) {
				debouncedOnChange(changes);
			} else {
				// Flush any pending debounced changes first
				debouncedOnChange.flush();
				onChange(changes);
			}
		});

		return () => subscription.unsubscribe();
	}, [onChange, form, debouncedOnChange, debounceMs]);
}
