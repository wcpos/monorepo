import * as React from 'react';
import get from 'lodash/get';
import Search from '@wcpos/common/src/components/search';
import useQuery from '@wcpos/common/src/hooks/use-query';

const SearchBar = () => {
	const { query, setQuery } = useQuery();

	const onSearch = React.useCallback(
		(search: string) => {
			setQuery(['search', 'name'], search);
		},
		[setQuery]
	);

	return (
		<Search
			label="Search Products"
			placeholder="Search Products"
			value={get(query, ['search', 'name'], '')}
			onSearch={onSearch}
		/>
	);
};

export default SearchBar;
