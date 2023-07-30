import * as React from 'react';

import delay from 'lodash/delay';

import TextInput from '@wcpos/components/src/textinput';

import { t } from '../../../../lib/translations';
import useCustomerNameFormat from '../../hooks/use-customer-name-format';

/**
 *
 */
const SearchInput = ({ onSearch, setOpened, autoFocus, selectedCustomer }) => {
	const [search, setSearch] = React.useState('');
	const { format } = useCustomerNameFormat();
	const initialRender = React.useRef(true);

	/**
	 *
	 */
	const placeholder = React.useMemo(() => {
		if (selectedCustomer) {
			return format(selectedCustomer);
		}

		return t('Search Customers', { _tags: 'core' });
	}, [selectedCustomer, format]);

	/**
	 * HACK: I want to pass search to onSearch, but not on initial render
	 */
	React.useEffect(() => {
		if (initialRender.current) {
			initialRender.current = false;
		} else {
			onSearch(search);
		}
	}, [search, onSearch]);

	/**
	 *
	 */
	return (
		<TextInput
			value={search}
			onChangeText={setSearch}
			containerStyle={{ flex: 1 }}
			clearable
			autoFocus={autoFocus}
			placeholder={placeholder}
			/**
			 * FIXME: this is a hack, useEffect is being called before onLayout for the Popover.Target
			 * which means the width is not set correctly.
			 */
			onFocus={() => delay(() => setOpened(true), 100)}
		/>
	);
};

export default SearchInput;
