import * as React from 'react';

import { useObservableSuspense } from 'observable-hooks';

import { ComboboxList, ComboboxItem, useRootContext } from '@wcpos/components/src/combobox';

import { CustomerSelectItem } from './item';

interface Props {
	query: any;
	withGuest?: boolean;
}

/**
 *
 */
export const CustomerList = ({ query, withGuest }: Props) => {
	const result = useObservableSuspense(query.resource);
	const { onValueChange } = useRootContext();

	return (
		<ComboboxList>
			{result.hits.map(({ id, document }) => {
				return (
					<ComboboxItem
						key={id}
						/**
						 * value has to be a string, which we then transform back to an int, which is stupid
						 */
						value={String(document.id)}
						onSelect={(value) => onValueChange({ value, item: document })}
					>
						<CustomerSelectItem customer={document} />
					</ComboboxItem>
				);
			})}
		</ComboboxList>
	);
};
