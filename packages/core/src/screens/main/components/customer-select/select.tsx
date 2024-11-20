import * as React from 'react';

import {
	Combobox,
	ComboboxTrigger,
	ComboboxContent,
	ComboboxValue,
} from '@wcpos/components/src/combobox';

import { CustomerSearch } from './search';
import { useT } from '../../../../contexts/translations';

interface CustomerSelectProps extends React.ComponentPropsWithoutRef<typeof Combobox> {
	withGuest?: boolean;
}

/**
 *
 */
export const CustomerSelect = React.forwardRef<
	React.ElementRef<typeof Combobox>,
	CustomerSelectProps
>(({ value, onValueChange, withGuest, disabled, ...props }, ref) => {
	const t = useT();

	/**
	 *
	 */
	return (
		<Combobox value={value} onValueChange={onValueChange} {...props}>
			<ComboboxTrigger disabled={disabled}>
				<ComboboxValue placeholder={t('Select Customer', { _tags: 'core' })} />
			</ComboboxTrigger>
			<ComboboxContent>
				<CustomerSearch withGuest={withGuest} />
			</ComboboxContent>
		</Combobox>
	);
});
