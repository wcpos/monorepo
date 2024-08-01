import * as React from 'react';

import { useObservableSuspense } from 'observable-hooks';

import { CommandList, CommandItem } from '@wcpos/tailwind/src/command';

import { CustomerSelectItem } from './item';

interface Props {
	query: any;
	onSelect: (customerId: number) => void;
	withGuest?: boolean;
}

/**
 *
 */
export const CustomerList = ({ query, onSelect, withGuest }: Props) => {
	const result = useObservableSuspense(query.resource);

	return (
		<CommandList>
			{result.hits.map(({ id, document }) => {
				return (
					<CommandItem
						key={id}
						/**
						 * value has to be a string, which we then transform back to an int, which is stupid
						 */
						value={String(document.id)}
						onSelect={(val) => onSelect(parseInt(val, 10))}
					>
						<CustomerSelectItem customer={document} />
					</CommandItem>
				);
			})}
		</CommandList>
	);
};
