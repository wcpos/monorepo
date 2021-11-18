import * as React from 'react';
import { View } from 'react-native';
import get from 'lodash/get';
import Search from '@wcpos/common/src/components/search';
import useQuery from '@wcpos/common/src/hooks/use-query';
import UiSettings from '../common/ui-settings';

interface SearchBarProps {
	ui: any;
}

const SearchBar = ({ ui }: SearchBarProps) => {
	const { query, setQuery } = useQuery();

	const onSearch = React.useCallback(
		(search: string) => {
			setQuery(['search', 'name'], search);
		},
		[setQuery]
	);

	/**
	 *
	 */
	const filters = React.useMemo(() => {
		const f: any[] = [];
		// if (get(query, 'filters.category')) {
		// 	f.push({
		// 		label: get(query, 'filters.category.name'),
		// 		onRemove: () => {
		// 			setQuery('filters.category', null);
		// 		},
		// 	});
		// }
		// if (get(query, 'filters.tag')) {
		// 	f.push({
		// 		label: get(query, 'filters.tag.name'),
		// 		onRemove: () => {
		// 			setQuery('filters.tag', null);
		// 		},
		// 	});
		// }
		return f;
	}, [query, setQuery]);

	return (
		<View style={{ flexDirection: 'row' }}>
			<Search
				label="Order Products"
				placeholder="Order Products"
				value={get(query, ['search', 'name'], '')}
				onSearch={onSearch}
				filters={filters}
			/>
			<UiSettings ui={ui} />
		</View>
	);
};

export default SearchBar;
