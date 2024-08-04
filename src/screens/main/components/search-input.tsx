import * as React from 'react';

import { Input } from '@wcpos/tailwind/src/input';

interface Props {
	placeholder: string;
	value: string;
	onSearch: (search: string) => void;
}

/**
 *
 */
export const SearchInput = ({ placeholder, value, onSearch }: Props) => {
	return (
		<Input
			placeholder={placeholder}
			value={value}
			onChangeText={onSearch}
			// value={search}
			// onChange={(e) => onSearch(e.target.value)}
			// onClear={() => onSearch('')}
			// autoFocus
			// icon="search"
		/>
	);
};
