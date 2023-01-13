import * as React from 'react';

interface UseUncontrolledInput<T> {
	/** Value for controlled state */
	value?: T;

	/** Initial value for uncontrolled state */
	defaultValue?: T;

	/** Final value for uncontrolled state when value and defaultValue are not provided */
	finalValue?: T;

	/** Controlled state onChange handler */
	onChange?(value: T): void;
}

/**
 * Let us have an "Uncontrolled state" for a React Component.
 * This means that component can optionally receive a "callback" prop
 * which should update the main component state. If this "callback" prop
 * is not passed, component should itself handle its main state update.
 *
 * @see https://reactjs.org/docs/uncontrolled-components.html
 */
export function useUncontrolled<T>({
	value,
	defaultValue,
	finalValue,
	onChange = () => {},
}: UseUncontrolledInput<T>): [T, (value: T) => void, boolean] {
	const [uncontrolledValue, setUncontrolledValue] = React.useState(
		defaultValue !== undefined ? defaultValue : finalValue
	);

	const handleUncontrolledChange = (val: T) => {
		setUncontrolledValue(val);
		onChange?.(val);
	};

	if (value !== undefined) {
		return [value as T, onChange, true];
	}

	return [uncontrolledValue as T, handleUncontrolledChange, false];
}
