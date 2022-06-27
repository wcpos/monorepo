import * as React from 'react';
import { useObservableState } from 'observable-hooks';
import get from 'lodash/get';
import Search from '@wcpos/components/src/search';
import useOrders from '@wcpos/hooks/src/use-orders';

const SearchBar = () => {
	const { query$, setQuery } = useOrders();
	const query = useObservableState(query$, query$.getValue());

	const onSearch = React.useCallback(
		(search: string) => {
			setQuery('search', search);
		},
		[setQuery]
	);

	/**
	 *
	 */
	const filters = React.useMemo(() => {
		const f: any[] = [];
		// if (get(query, 'filters.category')) {
		// 	f.push({
		// 		label: get(query, 'filters.category.name'),
		// 		onRemove: () => {
		// 			setQuery('filters.category', null);
		// 		},
		// 	});
		// }
		// if (get(query, 'filters.tag')) {
		// 	f.push({
		// 		label: get(query, 'filters.tag.name'),
		// 		onRemove: () => {
		// 			setQuery('filters.tag', null);
		// 		},
		// 	});
		// }
		return f;
	}, [query, setQuery]);

	return (
		<Search
			label="Search Orders"
			placeholder="Search Orders"
			value={query.search}
			onSearch={onSearch}
			filters={filters}
		/>
	);
};

export default SearchBar;
