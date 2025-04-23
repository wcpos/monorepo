import * as React from 'react';

import {
	Combobox,
	ComboboxTrigger,
	ComboboxContent,
	ComboboxValue,
} from '@wcpos/components/combobox';

import { CustomerSearch } from './search';
import { useT } from '../../../../contexts/translations';

interface CustomerSelectProps extends React.ComponentProps<typeof Combobox> {
	withGuest?: boolean;
}

/**
 *
 */
export const CustomerSelect = ({ withGuest, disabled, ...props }: CustomerSelectProps) => {
	const t = useT();

	/**
	 *
	 */
	return (
		<Combobox {...props}>
			<ComboboxTrigger disabled={disabled}>
				<ComboboxValue placeholder={t('Select Customer', { _tags: 'core' })} />
			</ComboboxTrigger>
			<ComboboxContent>
				<CustomerSearch withGuest={withGuest} />
			</ComboboxContent>
		</Combobox>
	);
};
