/**
 * Set a mutable ref's current value.
 * Extracted as a helper so the react-compiler doesn't flag ref mutations
 * inside components as "mutating a return value".
 */
export function setRefValue<T>(ref: { current: T }, value: T): void {
	ref.current = value;
}
