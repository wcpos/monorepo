import * as React from 'react';

import delay from 'lodash/delay';

import TextInput from '@wcpos/components/src/textinput';

import { useStoreStateManager } from '../../../contexts/store-state-manager';
import { useT } from '../../../../../contexts/translations';

/**
 *
 */
const SearchInput = ({ setOpened, onBlur }) => {
	const [search, setSearch] = React.useState('');
	const manager = useStoreStateManager();
	const t = useT();

	/**
	 *
	 */
	const handleSearch = React.useCallback(
		(search) => {
			setSearch(search);
			const query = manager.getQuery(['products/categories']);
			query.debouncedSearch(search);
		},
		[manager]
	);

	/**
	 *
	 */
	return (
		<TextInput
			placeholder={t('Search Categories', { _tags: 'core' })}
			value={search}
			onChangeText={handleSearch}
			containerStyle={{ flex: 1, width: 170 }}
			size="small"
			clearable
			/**
			 * FIXME: this is a hack, useEffect is being called before onLayout for the Popover.Target
			 * which means the width is not set correctly.
			 */
			onFocus={() => delay(() => setOpened(true), 100)}
			onBlur={() => delay(onBlur, 100)}
			autoFocus
		/>
	);
};

export default SearchInput;
