import * as React from 'react';

import { useObservableSuspense } from 'observable-hooks';

import { ComboboxList, ComboboxItem } from '@wcpos/components/combobox';
import { Text } from '@wcpos/components/text';

export const CategoryList = ({ query }) => {
	const result = useObservableSuspense(query.resource);

	const data = result.hits.map(({ id, document }) => ({
		value: String(document.id),
		label: document.name,
	}));

	return <ComboboxList data={data} />;
};

// /**
//  *
//  */
// export const CategoryList = ({ query }) => {
// 	const result = useObservableSuspense(query.resource);

// 	return (
// 		<ComboboxList
// 			onEndReached={() => {
// 				if (query?.infiniteScroll) {
// 					query.loadMore();
// 				}
// 			}}
// 		>
// 			{result.hits.map(({ id, document }) => {
// 				return (
// 					<ComboboxItem
// 						key={id}
// 						/**
// 						 * value has to be a string, which we then transform back to an int, which is stupid
// 						 */
// 						value={String(document.id)}
// 					>
// 						<Text decodeHtml>{document.name}</Text>
// 					</ComboboxItem>
// 				);
// 			})}
// 		</ComboboxList>
// 	);
// };
