import * as React from 'react';
import { TextInput as RNTextInput } from 'react-native';

import delay from 'lodash/delay';

import TextInput, { TextInputProps } from '@wcpos/components/src/textinput';

import useCustomerNameFormat from '../../hooks/use-customer-name-format';

export interface SearchInputProps {
	onSearch: (search: string) => void;
	setOpened: (opened: boolean) => void;
	autoFocus?: boolean;
	selectedCustomer?: any;
	onBlur: () => void;
	size?: 'small' | 'normal';
	style?: TextInputProps['style'];
	opened: boolean;
	placeholder?: string;
}

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
	placeholder,
}: SearchInputProps) => {
	const [search, setSearch] = React.useState('');
	const { format } = useCustomerNameFormat();
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
			placeholder={selectedCustomer ? format(selectedCustomer) : placeholder}
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
