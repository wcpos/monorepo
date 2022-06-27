import * as React from 'react';
import { useObservableState } from 'observable-hooks';
import get from 'lodash/get';
import Search from '@wcpos/components/src/search';
import useProducts from '@wcpos/hooks/src/use-products';

const SearchBar = () => {
	const { query$, setQuery } = useProducts();
	const query = useObservableState(query$, query$.getValue());

	/**
	 *
	 */
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
		const f = [];
		if (get(query, 'filters.category')) {
			f.push({
				label: get(query, 'filters.category.name'),
				onRemove: () => {
					setQuery('filters.category', null);
				},
			});
		}
		if (get(query, 'filters.tag')) {
			f.push({
				label: get(query, 'filters.tag.name'),
				onRemove: () => {
					setQuery('filters.tag', null);
				},
			});
		}
		return f;
	}, [query, setQuery]);

	/**
	 *
	 */
	return (
		<Search
			label="Search Products"
			placeholder="Search Products"
			value={query.search || ''}
			onSearch={onSearch}
			filters={filters}
		/>
	);
};

export default SearchBar;
