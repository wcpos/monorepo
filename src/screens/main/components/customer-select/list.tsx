import * as React from 'react';

import toNumber from 'lodash/toNumber';
import { useObservableSuspense } from 'observable-hooks';

import { ComboboxList, ComboboxItem, useComboboxContext } from '@wcpos/components/src/combobox';

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
	const { onValueChange } = useComboboxContext();

	/**
	 *
	 */
	const hits = React.useMemo(
		() =>
			withGuest
				? [{ id: 'guest', document: { id: 0 } }, ...result.hits.filter((hit) => hit.id !== 'guest')]
				: result.hits,
		[result.hits, withGuest]
	);

	return (
		<ComboboxList
			onEndReached={() => {
				if (query?.infiniteScroll) {
					query.loadMore();
				}
			}}
		>
			{hits.map(({ id, document }) => {
				return (
					<ComboboxItem
						key={id}
						/**
						 * value has to be a string, which we then transform back to an int, which is stupid
						 */
						value={String(document.id)}
						onSelect={(value) => onValueChange({ value: toNumber(value), item: document })}
					>
						<CustomerSelectItem customer={document} />
					</ComboboxItem>
				);
			})}
		</ComboboxList>
	);
};
