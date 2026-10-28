import * as React from 'react';

import { FormInput } from '@wcpos/components/form';

type Props = Omit<React.ComponentProps<typeof FormInput>, 'value' | 'onChange' | 'type'> & {
	value?: number | null;
	onChange: (port: number) => void;
};

/** A printer's port: an identifier typed as digits (never grouped or stepped), held as the profile's number. */
export function FormPortField({ value, onChange, ...props }: Props) {
	return (
		<FormInput
			{...props}
			type="numeric"
			value={value == null ? '' : String(value)}
			onChange={(text) => onChange(Number(String(text).replace(/\D/g, '')) || 0)}
		/>
	);
}
