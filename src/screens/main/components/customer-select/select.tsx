import * as React from 'react';

import {
	Combobox,
	ComboboxTrigger,
	ComboboxContent,
	ComboboxValue,
} from '@wcpos/components/src/combobox';

import { CustomerSearch } from './search';
import { useT } from '../../../../contexts/translations';

type CustomerDocument = import('@wcpos/database').CustomerDocument;

interface CustomerSelectProps {
	value?: CustomerDocument;
	onValueChange?: (customer: CustomerDocument) => void;
	onBlur?: () => void;
	initialParams?: any;
	queryKey?: string;
	placeholder?: string;
	withGuest?: boolean;
	label?: string;
	emit?: 'id' | 'document';
}

/**
 *
 */
export const CustomerSelect = React.forwardRef<HTMLElement, CustomerSelectProps>(
	({ value, onValueChange, withGuest }, ref) => {
		const t = useT();
		/**
		 *
		 */
		return (
			<Combobox onValueChange={onValueChange}>
				<ComboboxTrigger>
					<ComboboxValue placeholder={t('Select Customer', { _tags: 'core' })} />
				</ComboboxTrigger>
				<ComboboxContent>
					<CustomerSearch />
				</ComboboxContent>
			</Combobox>
		);
	}
);
