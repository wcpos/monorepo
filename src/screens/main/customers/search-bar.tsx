import * as React from 'react';
import { View } from 'react-native';

import get from 'lodash/get';
import { useObservableState } from 'observable-hooks';

import Search from '@wcpos/components/src/search';

import useCustomers from '../../../contexts/customers';
import { t } from '../../../lib/translations';

const SearchBar = () => {
	const { query$, setQuery } = useCustomers();
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
			label={t('Search Customers')}
			placeholder={t('Search Customers')}
			value={query.search}
			onSearch={onSearch}
			filters={filters}
		/>
	);
};

export default SearchBar;
