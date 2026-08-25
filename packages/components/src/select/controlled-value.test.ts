import { EMPTY_OPTION, toControlledSingleProps } from './controlled-value';

/**
 * The regression this guards. `@rn-primitives/select` passes our Option to Radix as
 * `value={value?.value}`, so a controlled select whose selection is cleared to `undefined`
 * hands Radix `undefined` — which is how Radix spells "uncontrolled". Radix logs
 * "Select is changing from controlled to uncontrolled" and takes over the selection with
 * its own internal state for the rest of the component's life.
 */
describe('toControlledSingleProps', () => {
	it('keeps a cleared selection controlled', () => {
		const props = toControlledSingleProps({ children: null, value: undefined });

		expect(props.value).toEqual(EMPTY_OPTION);
	});

	it('passes a real selection through untouched', () => {
		const value = { value: 'pending', label: 'Pending' };

		expect(toControlledSingleProps({ children: null, value }).value).toBe(value);
	});

	/**
	 * A select driven by `defaultValue` owns its own state — handing it a `value` would
	 * make it controlled and freeze it on the empty option.
	 */
	it('leaves an uncontrolled select alone', () => {
		const props = toControlledSingleProps({
			children: null,
			defaultValue: { value: 'pending', label: 'Pending' },
		});

		expect('value' in props).toBe(false);
	});

	/**
	 * Radix reads the empty string as "no selection", which is what makes the placeholder
	 * show. Any other sentinel would render as a selected item with a blank label.
	 */
	it('clears with the empty string Radix reads as no selection', () => {
		expect(EMPTY_OPTION.value).toBe('');
	});
});
