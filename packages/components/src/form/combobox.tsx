import * as React from 'react';

import { FormOptionControl } from './option-control';
import { Combobox } from '../combobox';

import type { FormOptionFieldProps } from './option-control';

export type FormComboboxProps<TControl extends React.ElementType = typeof Combobox> =
	FormOptionFieldProps<TControl>;

/** Form field backed by `Combobox`; the behaviour lives in `FormOptionControl`. */
export function FormCombobox<TControl extends React.ElementType = typeof Combobox>(
	props: FormComboboxProps<TControl>
) {
	return <FormOptionControl defaultComponent={Combobox} {...props} />;
}
