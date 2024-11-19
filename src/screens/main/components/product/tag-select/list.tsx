import * as React from 'react';

import { useObservableSuspense } from 'observable-hooks';

import { ComboboxList, ComboboxItem } from '@wcpos/components/src/combobox';

/**
 *
 */
export const TagList = ({ query }) => {
	const result = useObservableSuspense(query.resource);

	return (
		<ComboboxList
			onEndReached={() => {
				if (query?.infiniteScroll) {
					query.loadMore();
				}
			}}
		>
			{result.hits.map(({ id, document }) => {
				return (
					<ComboboxItem
						key={id}
						/**
						 * value has to be a string, which we then transform back to an int, which is stupid
						 */
						value={String(document.id)}
					>
						{document.name}
					</ComboboxItem>
				);
			})}
		</ComboboxList>
	);
};
