import * as React from 'react';

import TextInput from '@wcpos/components/src/textinput';

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
		<TextInput
			placeholder={t('Search Customers', { _tags: 'core' })}
			value={search}
			onChangeText={onSearch}
			containerStyle={{ flex: 1 }}
			clearable
		/>
	);
};

export default SearchBar;
