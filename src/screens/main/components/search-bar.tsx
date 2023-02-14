import * as React from 'react';

import TextInput from '@wcpos/components/src/textinput';

const SearchBar = ({ placeholder, value, onSearch, leftAccessory }) => {
	return (
		<TextInput
			placeholder={placeholder}
			value={value}
			onChange={onSearch}
			leftAccessory={leftAccessory}
		/>
	);
};

export default SearchBar;
