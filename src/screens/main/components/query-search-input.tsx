import * as React from 'react';

import { useSubscription } from 'observable-hooks';

import type { Query } from '@wcpos/query';
import { Input } from '@wcpos/tailwind/src/input';

interface Props {
	query: Query<any>;
	placeholder: string;
}

/**
 *
 */
export const QuerySearchInput = ({ query, placeholder }: Props) => {
	const [search, setSearch] = React.useState('');

	/**
	 * Hack: If I set the search directly on the query, I need to update the state
	 */
	useSubscription(query.params$, (params) => {
		if (params.search) {
			setSearch(params.search);
		}
	});

	/**
	 * Hack: I need to clear the search field when the collection is reset
	 */
	useSubscription(query.cancel$, () => {
		setSearch('');
	});

	/**
	 *
	 */
	const onSearch = React.useCallback(
		(search: string) => {
			setSearch(search);
			query.debouncedSearch(search);
		},
		[query]
	);

	/**
	 *
	 */
	return <Input placeholder={placeholder} value={search} onChangeText={onSearch} clearable />;
};
