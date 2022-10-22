import * as React from 'react';
import { useObservableState } from 'observable-hooks';
import get from 'lodash/get';
import Search from '@wcpos/components/src/search';
import useOrders from '@wcpos/core/src/contexts/orders';
import useWhyDidYouUpdate from '@wcpos/hooks/src/use-why-did-you-update';
import { t } from '@wcpos/core/src/lib/translations';

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
