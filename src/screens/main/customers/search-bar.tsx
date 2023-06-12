import * as React from 'react';

import TextInput from '@wcpos/components/src/textinput';

import { t } from '../../../lib/translations';
import useCustomers from '../contexts/customers';

const SearchBar = () => {
	const { setQuery } = useCustomers();
	const [search, setSearch] = React.useState();

	const onSearch = React.useCallback(
		(search) => {
			setSearch(search);
			setQuery('search', search, true);
		},
		[setQuery]
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
