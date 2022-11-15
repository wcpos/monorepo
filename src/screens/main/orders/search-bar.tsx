import * as React from 'react';

import get from 'lodash/get';
import { useObservableState } from 'observable-hooks';

import Search from '@wcpos/components/src/search';
import useWhyDidYouUpdate from '@wcpos/hooks/src/use-why-did-you-update';

import useOrders from '../../../contexts/orders';
import { t } from '../../../lib/translations';

const SearchBar = () => {
	const { query$, setQuery } = useOrders();
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
		const f: any[] = [];
		if (get(query, ['filters', 'status'])) {
			f.push({
				label: get(query, 'filters.status'),
				onRemove: () => {
					setQuery('filters.status', null);
				},
			});
		}
		return f;
	}, [query, setQuery]);

	/**
	 *
	 */
	useWhyDidYouUpdate('OrderSearchBar', { query, filters, onSearch, query$, setQuery });

	/**
	 *
	 */
	return (
		<Search
			label={t('Search Orders')}
			placeholder={t('Search Orders')}
			value={query.search}
			onSearch={onSearch}
			filters={filters}
		/>
	);
};

export default SearchBar;
