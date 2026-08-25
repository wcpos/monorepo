import type { Option, SelectRootProps } from './types';

/**
 * The "nothing is selected" Option.
 *
 * On web `@rn-primitives/select` hands our Option to Radix as `value={value?.value}`, so an
 * `undefined` Option flips Radix's Select from controlled to uncontrolled the moment a
 * selection is cleared — Radix warns about it, and from that point its own internal state,
 * not ours, decides what is selected. Radix's sentinel for "no selection" is the empty
 * string, so a cleared selection travels as this Option and the component stays controlled
 * for its whole lifetime. `SelectValue` reads an empty `value` as no selection and shows the
 * placeholder, on both platforms.
 */
export const EMPTY_OPTION: NonNullable<Option> = { value: '', label: '' };

/**
 * Keep a controlled single-select controlled across a cleared selection.
 *
 * Only a select that was handed a `value` prop is controlled — one driven by `defaultValue`
 * has to keep its own state, so its props are passed through untouched.
 */
export function toControlledSingleProps<T extends Omit<SelectRootProps, 'multiple'>>(props: T): T {
	if (!('value' in props)) return props;
	return { ...props, value: (props as { value?: Option }).value ?? EMPTY_OPTION };
}
