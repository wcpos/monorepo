import type { Option } from '../combobox';

/**
 * Convert a Select/Combobox selection back to the scalar a form field holds.
 *
 * A single-select form field is declared as `FormItemProps<string>` — its value is a
 * string, so clearing it must yield the empty string, never `undefined`.
 *
 * That distinction is load-bearing on the write path. `useFormChangeHandler` builds a
 * patch of `{ [name]: value }` and hands it to the caller's persist function, where
 * `JSON.stringify` drops keys whose value is `undefined`. A cleared field would then
 * reach the server as *no change at all* rather than as a clear.
 *
 * FormSelect and FormCombobox each inlined this conversion and disagreed about it:
 * FormSelect emitted `''` and FormCombobox emitted `undefined`. Neither is reachable
 * through the UI today because no control exposes a clear affordance — which is
 * exactly why it survived. Adding one is what would have made it a bug, so the
 * conversion lives here, once, instead of at each call site.
 */
export function optionToFieldValue(option: Option | undefined): string {
	return option?.value ?? '';
}
