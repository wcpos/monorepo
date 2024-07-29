import * as React from 'react';

import { useObservableSuspense } from 'observable-hooks';

import { CommandList, CommandItem } from '@wcpos/tailwind/src/command';

/**
 *
 */
export const CategoryList = ({ query, onSelect }) => {
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
						{document.name}
					</CommandItem>
				);
			})}
		</CommandList>
	);
};
