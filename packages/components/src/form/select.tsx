import * as React from 'react';

import { FormOptionControl } from './option-control';
import { Select } from '../select';

import type { FormOptionFieldProps } from './option-control';

export type FormSelectProps<TControl extends React.ElementType = typeof Select> =
	FormOptionFieldProps<TControl>;

/**
 * Form field backed by `Select`. The behaviour lives in `FormOptionControl`, which
 * `FormCombobox` shares — the two wrappers differ only in the control they default to.
 */
export function FormSelect<TControl extends React.ElementType = typeof Select>(
	props: FormSelectProps<TControl>
) {
	return <FormOptionControl defaultComponent={Select} {...props} />;
}
