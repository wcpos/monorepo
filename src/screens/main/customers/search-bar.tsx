import * as React from 'react';

import { Input } from '@wcpos/tailwind/src/input';

import { useT } from '../../../contexts/translations';

const SearchBar = ({ query }) => {
	const [search, setSearch] = React.useState();
	const t = useT();

	const onSearch = React.useCallback(
		(search) => {
			setSearch(search);
			query.debouncedSearch(search);
		},
		[query]
	);

	return (
		<Input
			placeholder={t('Search Customers', { _tags: 'core' })}
			value={search}
			onChangeText={onSearch}
			// containerStyle={{ flex: 1 }}
			// clearable
		/>
	);
};

export default SearchBar;
