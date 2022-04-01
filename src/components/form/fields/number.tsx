import * as React from 'react';
import { asNumber } from '../form.helpers';
import { useFormContext } from '../context';

// Matches a string that ends in a . character, optionally followed by a sequence of
// digits followed by any number of 0 characters up until the end of the line.
// Ensuring that there is at least one prefixed character is important so that
// you don't incorrectly match against "0".
const trailingCharMatcherWithPrefix = /\.([0-9]*0)*$/;

// This is used for trimming the trailing 0 and . characters without affecting
// the rest of the string. Its possible to use one RegEx with groups for this
// functionality, but it is fairly complex compared to simply defining two
// different matchers.
const trailingCharMatcher = /[0.]0*$/;

/**
 *
 */
export function NumberField<T extends object>({
	formData,
	...props
}: import('../types').FieldProps<T>): React.ReactElement {
	const { registry, onChange } = useFormContext();
	const { StringField } = registry.fields;
	const [lastValue, setLastValue] = React.useState(props.value);

	const value = React.useMemo(() => {
		if (typeof lastValue === 'string' && typeof value === 'number') {
			// Construct a regular expression that checks for a string that consists
			// of the formData value suffixed with zero or one '.' characters and zero
			// or more '0' characters
			const re = new RegExp(`${`${value}`.replace('.', '\\.')}\\.?0*$`);

			// If the cached "lastValue" is a match, use that instead of the formData
			// value to prevent the input value from changing in the UI
			if (lastValue.match(re)) {
				return lastValue;
			}
		}
		return formData;
	}, [formData, lastValue]);

	const handleChange = React.useCallback(
		(value: string) => {
			// Cache the original value in component state
			setLastValue({ lastValue: value });

			// Normalize decimals that don't start with a zero character in advance so
			// that the rest of the normalization logic is simpler
			if (`${value}`.charAt(0) === '.') {
				value = `0${value}`;
			}

			// Check that the value is a string (this can happen if the widget used is a
			// <select>, due to an enum declaration etc) then, if the value ends in a
			// trailing decimal point or multiple zeroes, strip the trailing values
			const processed =
				typeof value === 'string' && value.match(trailingCharMatcherWithPrefix)
					? asNumber(value.replace(trailingCharMatcher, ''))
					: asNumber(value);

			onChange(processed);
		},
		[onChange]
	);

	return <StringField {...props} formData={value} onChange={handleChange} />;
}
