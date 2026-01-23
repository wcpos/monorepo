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
	// Track if we're currently resetting from external data
	const isResettingRef = React.useRef(false);

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
	 * Intercept form.reset to track when we're resetting from external data.
	 * This prevents firing onChange when:
	 * - `values` prop changes (RHF internally calls reset)
	 * - Manual reset() calls (e.g., clearing form on dialog close)
	 *
	 * This is a legitimate useEffect for synchronizing with an external system (RHF).
	 */
	React.useEffect(() => {
		const originalReset = form.reset;
		form.reset = (...args) => {
			isResettingRef.current = true;
			const result = originalReset.apply(form, args);
			// Reset the flag after a microtask to ensure watch has fired
			queueMicrotask(() => {
				isResettingRef.current = false;
			});
			return result;
		};

		return () => {
			form.reset = originalReset;
		};
	}, [form]);

	/**
	 * Subscribe to form field changes and persist them.
	 * This is a legitimate useEffect for subscribing to an external store (RHF watch).
	 */
	React.useEffect(() => {
		const subscription = form.watch((values, { name, type }) => {
			// Skip if we're resetting from external data
			if (isResettingRef.current) {
				return;
			}

			// Only handle changes when a specific field is changed by the user.
			// When `name` is undefined, it means the entire form was reset/set programmatically
			if (name) {
				const value = get(values, name);
				const changes = { [name]: value } as Partial<T>;

				// Debounce text inputs to avoid saving on every keystroke
				if (isTextValue(value) && debounceMs > 0) {
					debouncedOnChange(changes);
				} else {
					// Flush any pending debounced changes first
					debouncedOnChange.flush();
					onChange(changes);
				}
			}
			// Skip when name is undefined (form.reset() or form.setValue() on entire form)
		});

		return () => subscription.unsubscribe();
	}, [onChange, form, debouncedOnChange, debounceMs]);
}
