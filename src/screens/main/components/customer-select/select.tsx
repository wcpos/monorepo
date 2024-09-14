import * as React from 'react';

import {
	Combobox,
	ComboboxTriggerPrimitive,
	ComboboxContent,
} from '@wcpos/components/src/combobox';
import { Text } from '@wcpos/components/src/text';

import { CustomerSearch } from './search';

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
		/**
		 *
		 */
		return (
			<Combobox onValueChange={onValueChange}>
				<ComboboxTriggerPrimitive asChild>
					<Text>Test</Text>
				</ComboboxTriggerPrimitive>
				<ComboboxContent>
					<CustomerSearch />
				</ComboboxContent>
			</Combobox>
		);
	}
);
