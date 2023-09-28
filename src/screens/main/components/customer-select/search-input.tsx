import * as React from 'react';
import { TextInput as RNTextInput } from 'react-native';

import delay from 'lodash/delay';

import TextInput from '@wcpos/components/src/textinput';

import { useT } from '../../../../contexts/translations';
import useCustomerNameFormat from '../../hooks/use-customer-name-format';

/**
 *
 */
const SearchInput = ({
	onSearch,
	setOpened,
	autoFocus,
	selectedCustomer,
	onBlur,
	size,
	style,
	opened,
}) => {
	const [search, setSearch] = React.useState('');
	const { format } = useCustomerNameFormat();
	const t = useT();
	const inputRef = React.useRef<RNTextInput>();

	/**
	 *
	 */
	const handleSearch = React.useCallback(
		(search) => {
			setSearch(search);
			onSearch(search);
		},
		[onSearch]
	);

	/**
	 *
	 */
	const placeholder = React.useMemo(() => {
		if (selectedCustomer) {
			return format(selectedCustomer);
		}

		return t('Search Customers', { _tags: 'core' });
	}, [selectedCustomer, t, format]);

	/**
	 * Focus input when opened
	 */
	React.useEffect(() => {
		if (opened) {
			inputRef.current.focus();
		}
	}, [opened]);

	/**
	 *
	 */
	return (
		<TextInput
			ref={inputRef}
			value={search}
			onChangeText={handleSearch}
			containerStyle={{ flex: 1 }}
			clearable
			autoFocus={autoFocus}
			placeholder={placeholder}
			size={size}
			style={style}
			/**
			 * FIXME: this is a hack, useEffect is being called before onLayout for the Popover.Target
			 * which means the width is not set correctly.
			 */
			onFocus={() => delay(() => setOpened(true), 100)}
			onBlur={() => delay(onBlur, 100)}
		/>
	);
};

export default SearchInput;
