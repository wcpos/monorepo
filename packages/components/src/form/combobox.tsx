import * as React from 'react';

import { FormOptionControl } from './option-control';
import { Combobox } from '../combobox';

import type { FormOptionFieldProps } from './option-control';

export type FormComboboxProps<TControl extends React.ElementType = typeof Combobox> =
	FormOptionFieldProps<TControl>;

/**
 * Form field backed by `Combobox`. The behaviour lives in `FormOptionControl`, which
 * `FormSelect` shares — the two wrappers differ only in the control they default to.
 */
export function FormCombobox<TControl extends React.ElementType = typeof Combobox>(
	props: FormComboboxProps<TControl>
) {
	return <FormOptionControl defaultComponent={Combobox} {...props} />;
}
